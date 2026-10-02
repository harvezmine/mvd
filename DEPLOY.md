# DEPLOY.md — mitravisidigital.com via PM2 + Cloudflare Tunnel (home server)

Runbook untuk menjalankan landing page PT Mitra Visi Digital di home server.
Ditulis agar bisa diikuti langkah demi langkah, termasuk oleh Claude di server.

**Ringkasan alur**

```
Pengunjung ──HTTPS──▶ Cloudflare (DNS, TLS, cache)
                        │
                        ▼  Cloudflare Tunnel (cloudflared)
                 http://127.0.0.1:3200
                        │
                        ▼
              PM2 → node server.js → folder public/
```

- Situsnya statis (HTML/CSS/JS + gambar). Tidak ada database, build step, atau `npm install`.
- `server.js` hanya memakai modul bawaan Node dan **hanya** menyajikan isi `public/`.
- Server mendengarkan di `127.0.0.1:3200`, jadi tidak terbuka ke jaringan.
  Satu-satunya jalan masuk adalah lewat Cloudflare Tunnel.
- TLS diurus Cloudflare. Tidak perlu sertifikat atau port forwarding di router.

---

## 0. Isi repo

| Path | Fungsi |
|---|---|
| `public/` | Seluruh isi situs: `index.html`, `404.html`, `assets/`, favicon (`favicon.ico/.svg`, `favicon-32.png`), `site.webmanifest`, `robots.txt`, `sitemap.xml` |
| `server.js` | Server statis (Node ≥ 18, tanpa dependensi). Ada endpoint `/healthz` |
| `ecosystem.config.cjs` | Konfigurasi PM2: nama app `mvd-web`, port `3200`, host `127.0.0.1` |
| `package.json` | Metadata dan skrip pintas (`npm run pm2:start`, dll.) |
| `DEPLOY.md` | Dokumen ini |

Repo: `https://github.com/harvezmine/mvd` (branch `main`).

Variabel yang dipakai di dokumen ini:

```bash
APP_DIR=~/apps/mitravisidigital     # lokasi repo di server, boleh diganti
PORT=3200                           # harus sama dengan ecosystem.config.cjs
DOMAIN=mitravisidigital.com
```

---

## 1. Cek awal di server

Jalankan dan catat hasilnya sebelum mengubah apa pun:

```bash
node -v                      # wajib >= 18
pm2 -v                       # kalau belum ada: lihat langkah 2
git --version
ss -ltnp | grep ':3200 '     # harus KOSONG; kalau terpakai, ganti PORT (lihat bagian 7)

# Apakah cloudflared sudah ada? Hasilnya menentukan opsi di langkah 5.
systemctl status cloudflared --no-pager 2>/dev/null | head -5
docker ps --format '{{.Names}}\t{{.Image}}' 2>/dev/null | grep -i cloudflared
```

> Catatan: Portalio di server ini sudah memakai `cloudflared` **di dalam Docker**
> (service `cloudflared` di `docker-compose.yml` Portalio). Container itu **tidak bisa**
> menjangkau `127.0.0.1` milik host. Baca langkah 5 sebelum memilih tunnel.

---

## 2. Pasang PM2 (sekali saja)

```bash
npm install -g pm2
pm2 -v
```

Kalau `npm install -g` butuh sudo dan Node dipasang lewat nvm, jalankan tanpa sudo
di user yang sama dengan yang akan menjalankan aplikasi.

---

## 3. Ambil kode

```bash
mkdir -p ~/apps
git clone https://github.com/harvezmine/mvd.git "$APP_DIR"
cd "$APP_DIR"
ls public/index.html server.js ecosystem.config.cjs   # ketiganya harus ada
```

Kalau repo privat, gunakan deploy key atau token GitHub. Alternatif tanpa git
(dari Mac pemilik): `rsync -av --exclude .git --exclude .DS_Store ~/dev/mvd/ user@server:~/apps/mitravisidigital/`.

---

## 4. Jalankan dengan PM2

```bash
cd "$APP_DIR"
pm2 start ecosystem.config.cjs
pm2 status                    # mvd-web harus "online"

# Tes lokal di server
curl -s http://127.0.0.1:3200/healthz                          # -> ok
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3200/  # -> 200
curl -s -I http://127.0.0.1:3200/assets/css/site.css | head -5   # -> 200, text/css
```

Supaya otomatis jalan lagi setelah server reboot:

```bash
pm2 save
pm2 startup          # salin & jalankan perintah sudo yang dicetak di layar
pm2 save
```

Rotasi log (disarankan, supaya log tidak menumpuk):

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

Perintah harian:

```bash
pm2 logs mvd-web             # lihat log
pm2 reload mvd-web           # reload tanpa downtime
pm2 restart mvd-web
pm2 stop mvd-web
```

---

## 5. Cloudflare Tunnel

Domain `mitravisidigital.com` sudah memakai nameserver Cloudflare. Pastikan domain
itu ada di **akun Cloudflare yang sama** dengan tunnel yang akan dipakai.

Pilih **satu** opsi.

### Opsi A (disarankan): cloudflared terpisah di host, khusus situs ini

Paling sederhana dan terisolasi dari stack Portalio. Server tetap aman di `127.0.0.1`.

1. Cloudflare Zero Trust → **Networks → Tunnels → Create a tunnel → Cloudflared**.
   Nama: `mvd-web`.
2. Pilih OS server. Cloudflare menampilkan perintah instalasi berisi token. Jalankan di server:
   ```bash
   # (pasang paket cloudflared bila belum ada, ikuti petunjuk di dashboard)
   sudo cloudflared service install <TOKEN_DARI_DASHBOARD>
   systemctl status cloudflared --no-pager   # harus active (running)
   ```
   Kalau di host **sudah ada** service `cloudflared` untuk tunnel lain, jangan timpa.
   Pakai tunnel yang sudah ada itu dan langsung ke langkah 3 (tambah public hostname).
3. Tab **Public Hostname** → tambahkan dua baris:

   | Subdomain | Domain | Type | URL |
   |---|---|---|---|
   | *(kosong)* | `mitravisidigital.com` | HTTP | `localhost:3200` |
   | `www` | `mitravisidigital.com` | HTTP | `localhost:3200` |

   `server.js` otomatis mengalihkan `www` ke domain utama (301).
4. Jangan isi `HTTP Host Header` di pengaturan origin. Biarkan default.

### Opsi B: pakai cloudflared Docker yang sudah ada (milik Portalio)

Pakai ini hanya kalau tidak mau menambah service baru. Masalahnya, container
tidak bisa menjangkau `127.0.0.1` host, jadi perlu dua perubahan:

1. Di `docker-compose.yml` Portalio, service `cloudflared`, tambahkan:
   ```yaml
       extra_hosts:
         - "host.docker.internal:host-gateway"
   ```
   lalu `docker compose up -d cloudflared`.
2. Buat server mendengarkan di alamat gateway Docker, bukan hanya loopback.
   Di `ecosystem.config.cjs`, ubah `HOST: '127.0.0.1'` menjadi `HOST: '0.0.0.0'`,
   lalu `pm2 reload ecosystem.config.cjs --update-env`.
   **Wajib:** tutup port 3200 dari luar, misalnya dengan
   `sudo ufw deny 3200` (atau aturan firewall setara) **dan** pastikan router
   tidak meneruskan port itu.
3. Di dashboard tunnel Portalio → Public Hostname, tambahkan `mitravisidigital.com`
   dan `www.mitravisidigital.com` → HTTP → `host.docker.internal:3200`.
   Letakkan **di atas** aturan wildcard Portalio bila ada.

### DNS & pengaturan Cloudflare (berlaku untuk kedua opsi)

- Menambah public hostname biasanya membuat CNAME otomatis:
  `@` dan `www` → `<TUNNEL_ID>.cfargotunnel.com` (Proxied).
  **Hapus** record A/AAAA/CNAME lama untuk `@` atau `www` bila bentrok.
- SSL/TLS → mode **Full** (atau Full (strict)). Aktifkan **Always Use HTTPS**.
- Opsional: SSL/TLS → Edge Certificates → HSTS, setelah situs terbukti stabil.

---

## 6. Verifikasi publik

Tunggu 1–2 menit setelah DNS dibuat, lalu:

```bash
curl -s https://mitravisidigital.com/healthz                                   # -> ok
curl -s -o /dev/null -w '%{http_code}\n' https://mitravisidigital.com/          # -> 200
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.mitravisidigital.com/
#   -> 301 https://mitravisidigital.com/
curl -s -o /dev/null -w '%{http_code}\n' https://mitravisidigital.com/tidak-ada  # -> 404
curl -s -o /dev/null -w '%{http_code}\n' https://mitravisidigital.com/server.js  # -> 404 (tidak boleh 200)
```

Lalu buka situs di browser HP dan laptop. Cek ganti bahasa ID/EN, menu mobile,
peta di bagian Kontak, dan preview link (OG image) misalnya lewat WhatsApp.

---

## 7. Update & deploy ulang

```bash
cd "$APP_DIR"
git pull --ff-only
```

- Perubahan di `public/` (HTML, CSS, JS, gambar) **langsung aktif** tanpa restart,
  karena server membaca file setiap permintaan.
- Perubahan `server.js` atau `ecosystem.config.cjs` perlu
  `pm2 reload ecosystem.config.cjs --update-env`.
- Cache: HTML, CSS, dan JS selalu divalidasi ulang ke server (murah, dijawab 304 bila
  tidak berubah), jadi langsung terlihat. Gambar di-cache 1 hari.
  Kalau perubahan harus terlihat seketika, buka Cloudflare → Caching →
  **Purge Cache** (Custom: URL file yang diubah, atau Purge Everything).
  Saat mengganti foto, sebaiknya pakai **nama file baru** supaya tidak tertahan cache.

Ganti port: ubah `PORT` di `ecosystem.config.cjs`, jalankan
`pm2 reload ecosystem.config.cjs --update-env`, lalu ubah URL di public hostname tunnel.

Rollback cepat: `git log --oneline`, lalu `git checkout <commit_sebelumnya> -- public`
(atau `git reset --hard <commit>` bila memang ingin kembali total).

---

## 8. Sebelum go-live (konten)

Isi data yang masih kosong di `public/assets/js/site.js`, blok `CONFIG` di bagian atas:

```js
var CONFIG = {
  whatsapp: '',   // format internasional tanpa +, contoh '6281234567890'
  email:    '',   // contoh 'halo@mitravisidigital.com'
  nib:      ''    // Nomor Induk Berusaha
};
```

Selama kosong, kontak tampil "Segera tersedia" dan formulir menampilkan
pemberitahuan bahwa kontak belum aktif. Checklist lain:

- [ ] Tambahkan `email`, `telephone`, dan NIB ke JSON-LD `Organization` di `public/index.html`.
- [x] Logo resmi sudah terpasang (`public/assets/img/brand/`). Sumber aslinya `public/assets/logo-putih.png`.
- [ ] Ganti foto Unsplash dengan foto tim/kantor asli (`public/assets/img/photos/`, kredit di `CREDITS.md`).
- [ ] Pastikan pin peta (Jl. Wayabula No. 60) sudah benar.
- [ ] Daftarkan `https://mitravisidigital.com/sitemap.xml` di Google Search Console.

---

## 9. Troubleshooting

| Gejala | Kemungkinan penyebab | Cek / perbaikan |
|---|---|---|
| `pm2 status` → `errored` | Node < 18 atau port terpakai | `pm2 logs mvd-web --lines 50`; `ss -ltnp \| grep 3200` |
| `curl 127.0.0.1:3200` gagal | app tidak jalan | `pm2 restart mvd-web`; cek log |
| Browser: **Error 1033** | cloudflared mati atau token salah | Opsi A: `journalctl -u cloudflared -n 50`; Opsi B: `docker compose logs cloudflared` |
| Browser: **502 Bad Gateway** | tunnel hidup tapi origin tak terjangkau | URL public hostname harus `localhost:3200` (Opsi A) atau `host.docker.internal:3200` (Opsi B) |
| Opsi B tetap 502 | server masih di `127.0.0.1` | `HOST: '0.0.0.0'` + `pm2 reload ... --update-env`; cek `extra_hosts` |
| Error **1000/1014 / DNS** | record lama bentrok | Hapus A/CNAME lama untuk `@`/`www`, biarkan CNAME tunnel |
| `www` tidak dialihkan | `CANONICAL_HOST` tidak terbaca | Pastikan ada di `env` ecosystem lalu `pm2 reload ecosystem.config.cjs --update-env` |
| Gambar baru tidak muncul | cache browser/Cloudflare (1 hari) | Pakai nama file baru, atau Purge Cache |
| App mati setelah reboot | `pm2 startup` belum dijalankan | Ulangi bagian 4: `pm2 startup` + `pm2 save` |
