#!/usr/bin/env bash
# deploy.sh — tarik kode terbaru landing page mitravisidigital.com dari GitHub
# lalu reload PM2.
#
# Pakai (di server, dari mana saja, setelah push ke GitHub):
#   ./deploy.sh           # deploy kalau ada commit baru
#   ./deploy.sh --force   # reload ulang walau tidak ada commit baru
#
# Alurnya:
#   1. git fetch. Kalau origin tidak punya commit baru DAN commit sekarang
#      sudah pernah sukses di-deploy, keluar.
#   2. git merge --ff-only.
#   3. pm2 startOrReload ecosystem.config.cjs --update-env. Situsnya statis
#      (tanpa npm install / build); perubahan public/ sebenarnya sudah aktif
#      begitu di-merge, reload diperlukan untuk server.js / ecosystem.
#   4. Cek kesehatan: /healthz menjawab "ok" dan / menjawab 200.
#   5. Catat commit yang sukses ke $APP_DIR/.deployed-rev.
#
# Semua state disimpan di luar repo supaya working tree tetap bersih:
#   $APP_DIR/.env.production   HOST/PORT/CANONICAL_HOST (dibaca ecosystem.config.cjs)
#   $APP_DIR/.deploy.env       opsional: GIT_TOKEN kalau repo dibuat private
#                              (fine-grained token, Contents: Read-only), chmod 600
#   $APP_DIR/.deployed-rev     commit terakhir yang sukses di-deploy
#   $APP_DIR/logs/deploy.log   log setiap deploy
#   $APP_DIR/.deploy.lock      kunci supaya dua deploy tidak jalan bersamaan

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${MVD_APP_DIR:-/var/www/mvd}"
APP_NAME="mvd-web"
ENV_FILE="$APP_DIR/.env.production"
LOG_FILE="$APP_DIR/logs/deploy.log"
LOCK_FILE="$APP_DIR/.deploy.lock"
REV_FILE="$APP_DIR/.deployed-rev"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  exit 1
}

env_get() {
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d "\"'"
}

git_remote() {
  # Token hanya dipakai sesaat lewat header, tidak pernah ditulis ke .git/config.
  if [[ -n "$GIT_TOKEN" ]]; then
    local header
    header="Authorization: Basic $(printf '%s' "x-access-token:${GIT_TOKEN}" | base64 -w0)"
    git -c http.extraHeader="$header" "$@"
  else
    git "$@"
  fi
}

# Dibungkus fungsi supaya bash membaca seluruh skrip sebelum menjalankannya:
# `git merge` di bawah bisa menimpa file ini sendiri saat sedang berjalan.
main() {
  local force=false
  case "${1:-}" in
    "") ;;
    --force) force=true ;;
    *) echo "Pakai: $0 [--force]" >&2; exit 2 ;;
  esac

  cd "$REPO_DIR"
  mkdir -p "$APP_DIR/logs"

  # --- kunci ---------------------------------------------------------------
  exec 200>"$LOCK_FILE"
  flock -n 200 || fail "deploy lain sedang berjalan (lock: $LOCK_FILE). Coba lagi nanti."

  # --- preflight -----------------------------------------------------------
  local cmd
  for cmd in git node pm2 curl flock; do
    command -v "$cmd" >/dev/null || fail "$cmd tidak ditemukan"
  done
  [[ -f "$ENV_FILE" ]] || fail "$ENV_FILE tidak ada — buat dulu (HOST, PORT, CANONICAL_HOST)."

  GIT_TOKEN=""
  if [[ -f "$APP_DIR/.deploy.env" ]]; then
    GIT_TOKEN="$(grep -E '^GIT_TOKEN=' "$APP_DIR/.deploy.env" | head -1 | cut -d= -f2-)"
  fi

  local branch
  branch="$(git symbolic-ref --short HEAD)" || fail "HEAD detached — tidak tahu branch mana yang harus di-pull"

  log "=== Deploy mulai (branch: $branch$([[ "$force" == true ]] && echo ', --force')) ==="

  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    fail "working tree tidak bersih, deploy dibatalkan supaya git pull tidak konflik:
$(git status --porcelain --untracked-files=no)"
  fi

  # --- fetch ---------------------------------------------------------------
  git_remote fetch origin "$branch" 2>&1 | tee -a "$LOG_FILE" || fail "git fetch gagal"

  local local_rev remote_rev deployed_rev merge_base
  local_rev="$(git rev-parse HEAD)"
  remote_rev="$(git rev-parse "origin/$branch")"
  deployed_rev="$(cat "$REV_FILE" 2>/dev/null || true)"

  if [[ "$local_rev" != "$remote_rev" ]]; then
    merge_base="$(git merge-base HEAD "origin/$branch")"
    if [[ "$merge_base" == "$remote_rev" ]]; then
      log "Local ($local_rev) lebih baru dari origin/$branch ($remote_rev) — tidak ada yang di-pull."
    elif [[ "$merge_base" != "$local_rev" ]]; then
      fail "local HEAD ($local_rev) menyimpang dari origin/$branch ($remote_rev) — tidak bisa fast-forward, perlu penanganan manual."
    else
      log "Update ditemukan: $local_rev -> $remote_rev"
      log "File berubah:
$(git diff --name-only "$local_rev" "$remote_rev")"

      # File yang dibuat langsung di server lalu di-commit dari tempat lain
      # (misalnya deploy.sh ini) membuat merge menolak "untracked working tree
      # files would be overwritten". Kalau isinya identik, aman dihapus.
      local f
      while IFS= read -r f; do
        if git cat-file -e "$remote_rev:$f" 2>/dev/null && git show "$remote_rev:$f" | cmp -s - "$f"; then
          log "  $f belum di-track tapi identik dengan versi di $branch — dilepas supaya merge bisa jalan"
          rm -f -- "$f"
        fi
      done < <(git ls-files --others --exclude-standard)

      git merge --ff-only "origin/$branch" 2>&1 | tee -a "$LOG_FILE" || fail "git merge --ff-only gagal"
    fi
  fi

  local target_rev
  target_rev="$(git rev-parse HEAD)"

  if [[ "$target_rev" == "$deployed_rev" && "$force" != true ]]; then
    log "Sudah paling baru dan sudah ter-deploy ($target_rev). Tidak ada yang di-deploy."
    exit 0
  fi

  [[ -f public/index.html && -f server.js && -f ecosystem.config.cjs ]] \
    || fail "public/index.html, server.js, atau ecosystem.config.cjs tidak ada"
  node --check server.js || fail "server.js gagal di-parse — tidak di-reload"

  # --- reload --------------------------------------------------------------
  log "pm2 startOrReload $target_rev ..."
  MVD_APP_DIR="$APP_DIR" pm2 startOrReload ecosystem.config.cjs --update-env 2>&1 | tee -a "$LOG_FILE" \
    || fail "pm2 reload gagal"
  pm2 save >/dev/null 2>&1 || log "PERINGATAN: pm2 save gagal"

  # --- cek kesehatan -------------------------------------------------------
  local host port base health="" code=""
  host="$(env_get HOST)"; host="${host:-127.0.0.1}"
  port="$(env_get PORT)"; port="${port:-3200}"
  base="http://$host:$port"

  log "Tunggu situs sehat di $base ..."
  local healthy=false
  for _ in $(seq 1 10); do
    sleep 2
    health="$(curl -s -m 5 "$base/healthz" || true)"
    code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$base/" || true)"
    if [[ "$health" == "ok" && "$code" == "200" ]]; then
      healthy=true
      break
    fi
  done

  if [[ "$healthy" != true ]]; then
    log "PERINGATAN: situs belum sehat setelah 20 detik (healthz: ${health:-none}, HTTP ${code:-none})."
    log "Cek: pm2 logs $APP_NAME --err --lines 50"
    log "Rollback: git reset --hard <commit sebelumnya> && ./deploy.sh --force"
    log "=== Deploy SELESAI DENGAN PERINGATAN ($target_rev) ==="
    exit 1
  fi

  printf '%s\n' "$target_rev" > "$REV_FILE"
  log "Situs sehat (healthz ok, HTTP $code)."
  log "=== Deploy sukses: ${deployed_rev:-(belum pernah)} -> $target_rev ==="
}

main "$@"
