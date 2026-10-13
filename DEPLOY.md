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
| `public/` | Seluruh isi situs: `index.html`, `checkout.html`, `pesanan.html`, halaman kebijakan (`syarat-ketentuan`, `kebijakan-privasi`, `kebijakan-pengembalian`), `404.html`, `assets/`, favicon, `site.webmanifest`, `robots.txt`, `sitemap.xml` |
| `public/assets/data/catalog.json` | **Satu-satunya sumber harga.** Dibaca beranda, halaman checkout, dan server saat membuat tagihan |
| `server.js` | Server Node ≥ 18 tanpa dependensi: file statis + API checkout & webhook Xendit. Ada endpoint `/healthz` |
| `.env.example` | Contoh konfigurasi Xendit. Salin jadi `.env` di server (tidak masuk git) |
| `data/orders/` | Dibuat otomatis. Satu file JSON per pesanan (berisi data pribadi pembeli, tidak masuk git) |
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
curl -s -o /dev/null -w '%{http_code}\n' https://mitravisidigital.com/checkout   # -> 200
curl -s -o /dev/null -w '%{http_code}\n' https://mitravisidigital.com/kebijakan-pengembalian  # -> 200
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

## 8. Checkout & Xendit

Alur pembelian: **Harga** di beranda → `/checkout?paket=<id>` → `POST /api/checkout`
→ halaman pembayaran Xendit (Invoice) → kembali ke `/pesanan?id=<nomor>`.
Harga **selalu** dihitung server dari `catalog.json`, bukan dari browser.

### 8a. Tanpa kunci Xendit (sementara, mis. saat verifikasi)

Checkout tetap berfungsi: pesanan disimpan di `data/orders/<nomor>.json`, pembeli
melihat halaman "Pesanan Anda sudah kami terima", dan tim menghubungi pembeli
untuk tautan pembayaran. Pesanan baru juga tercatat di log:

```bash
pm2 logs mvd-web --lines 50 | grep "Pesanan"
ls -lt "$APP_DIR/data/orders" | head
```

### 8b. Mengaktifkan pembayaran Xendit

1. Xendit Dashboard → **Settings → Developers → API Keys** → buat *secret key*
   dengan izin **Money-in: Write**. Mulai dengan kunci TEST (`xnd_development_…`).
2. Xendit Dashboard → **Settings → Developers → Webhooks**:
   - Salin **Verification token**.
   - Isi URL untuk event **Invoices paid**:
     `https://mitravisidigital.com/api/xendit/webhook`
3. Di server:
   ```bash
   cd "$APP_DIR"
   cp .env.example .env
   nano .env        # isi XENDIT_SECRET_KEY dan XENDIT_CALLBACK_TOKEN
   chmod 600 .env
   pm2 reload ecosystem.config.cjs --update-env
   pm2 logs mvd-web --lines 5   # harus muncul "Xendit aktif (mode TEST)" dan "webhook aktif"
   ```
4. Uji: pesan paket termurah di `/checkout`, bayar di halaman tes Xendit (simulasi
   pembayaran tersedia di mode TEST), lalu pastikan `/pesanan?id=…` menjadi
   **Lunas** dan log berisi `Pesanan LUNAS: …`.
5. Setelah akun Xendit disetujui, ganti `XENDIT_SECRET_KEY` dengan kunci LIVE
   (`xnd_production_…`), samakan token webhook mode LIVE, lalu reload lagi.

Catatan:
- Status pesanan juga dicek langsung ke Xendit saat halaman `/pesanan` dibuka,
  jadi tetap akurat walau webhook terlambat.
- Webhook dengan token salah ditolak (401); pembayaran kurang dari nilai pesanan
  tidak dianggap lunas.
- Batas: 8 pesanan per IP per 10 menit (mencegah spam tagihan).

### 8c. Aktivasi paket setelah pembayaran (manual)

Checkout menjual paket langganan **Portalio** dan **Sekretaris AI**. Pembayaran di
mitravisidigital.com belum terhubung otomatis ke sistem masing-masing produk, jadi
setiap pesanan lunas perlu diaktifkan oleh tim pada hari kerja berikutnya:

```bash
pm2 logs mvd-web --lines 200 | grep "Pesanan LUNAS"
cat "$APP_DIR/data/orders/<NOMOR>.json"   # product_id, package_id, period, customer.email/phone
```

- `product_id: portalio`: aktifkan paket pada akun Portalio dengan `customer.email`.
- `product_id: sekretaris-ai`: aktifkan paket untuk nomor `customer.phone`.
- Kirim konfirmasi ke pembeli lewat WhatsApp atau email.

### 8d. Mengubah harga atau paket

Edit `public/assets/data/catalog.json` saja: `products[] → plans[] → options[]`.
Setiap pilihan yang bisa dibeli punya `sku` unik dan `price` dalam Rupiah (tanpa titik).
Paket tanpa `options` (Gratis / Coba gratis) hanya tampil dengan tombol ke situs produk.
Harga **harus sama** dengan harga resmi di portalio.id dan secretary.my.id. Tidak perlu
restart. Samakan juga harga di JSON-LD `hasOfferCatalog` di `public/index.html`.

### 8e. Backup data pesanan

`data/orders/` berisi data pribadi pembeli. Jangan masuk git, dan backup berkala:

```bash
tar czf ~/backup/mvd-orders-$(date +%F).tgz -C "$APP_DIR" data/orders
```

---

## 9. Sebelum go-live (konten)

Data kontak ada di `public/assets/js/site.js`, blok `CONFIG` di bagian atas:

```js
var CONFIG = {
  whatsapp: '6289636458562', // sudah diisi (nomor dari data legal PT di Portalio)
  email:    'team@mvd.ai.id',
  nib:      '0409260102484'   // Nomor Induk Berusaha
};
```

Kontak yang kosong otomatis disembunyikan. Nomor telepon juga tertulis langsung di
HTML (beranda, footer semua halaman, halaman kebijakan), jadi bila nomor berganti,
cari & ganti `6289636458562` dan `+62 896-3645-8562` di folder `public/` (begitu juga
email `team@mvd.ai.id` dan NIB `0409260102484`, yang juga tertulis langsung di HTML). Checklist lain:

- [x] Telepon, email, alamat (kode pos 17411), dan NIB sudah terpasang di halaman & JSON-LD.
- [ ] Tinjau isi Syarat & Ketentuan dan Kebijakan Pengembalian Dana (terutama kebijakan refund Sekretaris AI).
- [x] Logo resmi sudah terpasang (`public/assets/img/brand/`). Sumber aslinya `public/assets/logo-putih.png`.
- [ ] Ganti foto Unsplash dengan foto tim/kantor asli (`public/assets/img/photos/`, kredit di `CREDITS.md`).
- [ ] Pastikan pin peta (Jl. Wayabula No. 60) sudah benar.
- [ ] Daftarkan `https://mitravisidigital.com/sitemap.xml` di Google Search Console.

---

## 10. Troubleshooting

| Gejala | Kemungkinan penyebab | Cek / perbaikan |
|---|---|---|
| `pm2 status` → `errored` | Node < 18 atau port terpakai | `pm2 logs mvd-web --lines 50`; `ss -ltnp \| grep 3200` |
| `curl 127.0.0.1:3200` gagal | app tidak jalan | `pm2 restart mvd-web`; cek log |
| Browser: **Error 1033** | cloudflared mati atau token salah | Opsi A: `journalctl -u cloudflared -n 50`; Opsi B: `docker compose logs cloudflared` |
| Browser: **502 Bad Gateway** | tunnel hidup tapi origin tak terjangkau | URL public hostname harus `localhost:3200` (Opsi A) atau `host.docker.internal:3200` (Opsi B) |
| Opsi B tetap 502 | server masih di `127.0.0.1` | `HOST: '0.0.0.0'` + `pm2 reload ... --update-env`; cek `extra_hosts` |
| Error **1000/1014 / DNS** | record lama bentrok | Hapus A/CNAME lama untuk `@`/`www`, biarkan CNAME tunnel |
| Checkout: "Halaman pembayaran belum bisa dibuat" | kunci Xendit salah/izin kurang | `pm2 logs mvd-web` → baris `Gagal membuat tagihan`; cek `XENDIT_SECRET_KEY` & izin Money-in Write |
| Pesanan tidak jadi "Lunas" | webhook belum diset / token beda | Cek URL webhook & `XENDIT_CALLBACK_TOKEN`; halaman `/pesanan` tetap mengecek status ke Xendit |
| `EACCES` saat membuat pesanan | folder `data/` tidak bisa ditulis | `chown -R $USER "$APP_DIR/data"` |
| `www` tidak dialihkan | `CANONICAL_HOST` tidak terbaca | Pastikan ada di `env` ecosystem lalu `pm2 reload ecosystem.config.cjs --update-env` |
| Gambar baru tidak muncul | cache browser/Cloudflare (1 hari) | Pakai nama file baru, atau Purge Cache |
| App mati setelah reboot | `pm2 startup` belum dijalankan | Ulangi bagian 4: `pm2 startup` + `pm2 save` |
