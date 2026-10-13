'use strict';
/* ==========================================================================
   Server mitravisidigital.com
   Hanya modul bawaan Node >= 18 (tanpa npm install). Dijalankan oleh PM2 dan
   diekspos lewat Cloudflare Tunnel, jadi cukup mendengarkan di 127.0.0.1.

   - Menyajikan isi folder public/ (file statis, URL boleh tanpa .html).
   - API checkout:
       POST /api/checkout          buat pesanan (+ tagihan Xendit bila dikonfigurasi)
       GET  /api/orders/:id        status pesanan untuk halaman /pesanan
       POST /api/xendit/webhook    callback invoice dari Xendit
   - Harga SELALU dihitung di server dari public/assets/data/catalog.json,
     tidak pernah dari data yang dikirim browser.
   - Pesanan disimpan sebagai file JSON di data/orders/ (di luar public/).
   ========================================================================== */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/* ---------- .env sederhana (tanpa dependensi) ---------- */
(function loadEnv() {
  const file = path.join(__dirname, '.env');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return; }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
})();

const ROOT = path.join(__dirname, 'public');
const CATALOG_FILE = path.join(ROOT, 'assets', 'data', 'catalog.json');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ORDERS_DIR = path.join(DATA_DIR, 'orders');
const PORT = Number(process.env.PORT) || 3200;
const HOST = process.env.HOST || '127.0.0.1';
// Domain utama; yang dipakai di tag canonical public/index.html.
const CANONICAL_HOST = (process.env.CANONICAL_HOST || '').toLowerCase();
// Domain lain yang juga disajikan langsung (dipisah koma), mis. "mvd.ai.id".
// Isinya identik dengan CANONICAL_HOST; tag canonical yang menyatukan
// keduanya di mata mesin pencari.
const ALIAS_HOSTS = (process.env.ALIAS_HOSTS || '')
  .toLowerCase()
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);
// Semua apex yang dilayani. Permintaan ke www.<apex> dialihkan ke <apex> (301).
const APEX_HOSTS = [CANONICAL_HOST].concat(ALIAS_HOSTS).filter(Boolean);
// Dipakai untuk URL kembali dari halaman pembayaran Xendit.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://mitravisidigital.com').replace(/\/+$/, '');
const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY || '';
const XENDIT_CALLBACK_TOKEN = process.env.XENDIT_CALLBACK_TOKEN || '';
const INVOICE_DURATION = Number(process.env.INVOICE_DURATION_SECONDS) || 86400; // 24 jam
// Hanya untuk pengujian lokal (server tiruan). Produksi: biarkan default.
const XENDIT_API = (process.env.XENDIT_API_BASE || 'https://api.xendit.co').replace(/\/+$/, '');

fs.mkdirSync(ORDERS_DIR, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

// HTML, CSS, JS, dan JSON selalu divalidasi ulang (ETag -> 304 bila tidak berubah),
// jadi perubahan langsung terlihat; gambar cache sehari (nama file tidak di-hash).
function cacheControl(ext) {
  if (['.html', '.css', '.js', '.json'].includes(ext)) return 'no-cache';
  if (['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg', '.ico', '.woff2'].includes(ext)) {
    return 'public, max-age=86400';
  }
  return 'public, max-age=3600';
}

function sendText(res, status, text, extra) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  }, SECURITY_HEADERS, extra));
  res.end(text);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  }, SECURITY_HEADERS));
  res.end(body);
}

function notFound(req, res) {
  const page = path.join(ROOT, '404.html');
  fs.readFile(page, (err, body) => {
    if (err) return sendText(res, 404, 'Halaman tidak ditemukan.');
    res.writeHead(404, Object.assign({
      'Content-Type': TYPES['.html'],
      'Cache-Control': 'no-cache',
      'Content-Length': body.length
    }, SECURITY_HEADERS));
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}

/* ==========================================================================
   Katalog & pesanan
   ========================================================================== */
function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
}

// Cari pilihan yang bisa dibeli berdasarkan SKU, lengkap dengan produk & paketnya.
function findPackage(sku) {
  for (const product of loadCatalog().products || []) {
    for (const plan of product.plans || []) {
      for (const opt of plan.options || []) {
        if (opt.sku === sku && Number.isInteger(opt.price) && opt.price > 0) {
          return {
            id: opt.sku,
            product_id: product.id,
            name: product.name + ' ' + plan.name + ' (' + opt.label + ')',
            period: opt.period,
            price: opt.price
          };
        }
      }
    }
  }
  return null;
}

const ORDER_ID_RE = /^MVD-\d{6}-[A-Z2-7]{6}$/;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function newOrderId() {
  const d = new Date();
  const ymd = String(d.getFullYear()).slice(2) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  const bytes = crypto.randomBytes(6);
  let rand = '';
  for (const b of bytes) rand += BASE32[b & 31];
  return 'MVD-' + ymd + '-' + rand;
}

function orderPath(id) { return path.join(ORDERS_DIR, id + '.json'); }

function readOrder(id) {
  if (!ORDER_ID_RE.test(id)) return null;
  try { return JSON.parse(fs.readFileSync(orderPath(id), 'utf8')); } catch (e) { return null; }
}

function writeOrder(order) {
  order.updated_at = new Date().toISOString();
  const tmp = orderPath(order.id) + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(order, null, 2));
  fs.renameSync(tmp, orderPath(order.id));
}

// Data yang aman ditampilkan di halaman status (tanpa data pribadi).
function publicOrder(o) {
  return {
    id: o.id,
    package_id: o.package_id,
    package_name: o.package_name,
    period: o.period || null,
    amount: o.amount,
    currency: 'IDR',
    status: o.status,
    created_at: o.created_at,
    paid_at: o.paid_at || null,
    payment_url: o.status === 'PENDING' && o.invoice_url ? o.invoice_url : null,
    expires_at: o.invoice_expiry || null
  };
}

/* ==========================================================================
   Validasi input
   ========================================================================== */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}
function cleanMultiline(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

// 0812..., 812..., +62812..., 62812... -> +62812...
function normalizePhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^62\d{8,13}$/.test(d) ? '+' + d : null;
}

function validateCheckout(body) {
  const errors = {};
  const pkg = findPackage(clean(body.package, 60));
  if (!pkg) errors.package = 'Pilih paket yang tersedia.';
  const name = clean(body.name, 100);
  if (name.length < 2) errors.name = 'Isi nama lengkap Anda.';
  const email = clean(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = 'Isi alamat email yang valid.';
  const phone = normalizePhone(body.phone);
  if (!phone) errors.phone = 'Isi nomor WhatsApp yang valid, contoh 0812 3456 7890.';
  if (body.agree !== true) errors.agree = 'Anda perlu menyetujui syarat dan kebijakan pengembalian dana.';
  return {
    errors,
    data: {
      pkg, name, email, phone,
      company: clean(body.company, 120),
      notes: cleanMultiline(body.notes, 2000)
    }
  };
}

/* ==========================================================================
   Xendit (Invoice API)
   ========================================================================== */
function xenditAuth() {
  return 'Basic ' + Buffer.from(XENDIT_SECRET_KEY + ':').toString('base64');
}

async function createInvoice(order, pkg) {
  const res = await fetch(XENDIT_API + '/v2/invoices', {
    method: 'POST',
    headers: { Authorization: xenditAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      external_id: order.id,
      amount: order.amount,
      currency: 'IDR',
      description: 'Langganan ' + pkg.name + ', masa aktif ' + pkg.period + ' - PT Mitra Visi Digital',
      invoice_duration: INVOICE_DURATION,
      payer_email: order.customer.email,
      customer: {
        given_names: order.customer.name,
        email: order.customer.email,
        mobile_number: order.customer.phone
      },
      items: [{ name: pkg.name, quantity: 1, price: order.amount, category: 'Langganan Digital' }],
      success_redirect_url: PUBLIC_BASE_URL + '/pesanan?id=' + order.id,
      failure_redirect_url: PUBLIC_BASE_URL + '/pesanan?id=' + order.id
    }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.invoice_url) {
    throw new Error('Xendit ' + res.status + ': ' + (data.error_code || '') + ' ' + (data.message || ''));
  }
  return data;
}

async function fetchInvoice(invoiceId) {
  const res = await fetch(XENDIT_API + '/v2/invoices/' + encodeURIComponent(invoiceId), {
    headers: { Authorization: xenditAuth() },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error('Xendit ' + res.status);
  return res.json();
}

// Petakan status invoice Xendit ke status pesanan.
function applyInvoiceStatus(order, inv) {
  const s = String(inv.status || '').toUpperCase();
  if ((s === 'PAID' || s === 'SETTLED') && order.status !== 'PAID') {
    const paid = Number(inv.paid_amount || inv.amount);
    if (paid >= order.amount) {
      order.status = 'PAID';
      order.paid_at = inv.paid_at || new Date().toISOString();
      order.payment_method = inv.payment_method || inv.payment_channel || null;
      console.log('Pesanan LUNAS: ' + order.id + ' (' + order.package_name + ', Rp' + order.amount + ')');
      return true;
    }
    console.warn('Jumlah bayar tidak cocok untuk ' + order.id + ': ' + paid + ' < ' + order.amount);
  } else if (s === 'EXPIRED' && order.status === 'PENDING') {
    order.status = 'EXPIRED';
    return true;
  }
  return false;
}

/* ==========================================================================
   Utilitas HTTP
   ========================================================================== */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const onData = (c) => {
      size += c.length;
      if (size > limit) {
        // Berhenti mengumpulkan, buang sisa body, lalu biarkan handler membalas 413.
        req.removeListener('data', onData);
        req.resume();
        reject(Object.assign(new Error('too large'), { status: 413 }));
        return;
      }
      chunks.push(c);
    };
    req.on('data', onData);
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clientIp(req) {
  return String(req.headers['cf-connecting-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0] ||
    req.socket.remoteAddress || '').trim();
}

// Batas sederhana di memori: maksimal N permintaan per IP per jendela waktu.
const hits = new Map();
function rateLimited(ip, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < 3600000)) hits.delete(ip);
}, 600000).unref();

// Formulir hanya boleh dikirim dari situs ini sendiri.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ==========================================================================
   Handler API
   ========================================================================== */
async function handleCheckout(req, res) {
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Permintaan ditolak.' });
  if (rateLimited(clientIp(req), 8, 10 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Terlalu banyak percobaan. Silakan coba lagi beberapa menit lagi.' });
  }
  let body;
  try { body = JSON.parse(await readBody(req, 16 * 1024)); } catch (e) {
    return sendJson(res, e.status || 400, { error: 'Data pesanan tidak valid.' });
  }
  const { errors, data } = validateCheckout(body || {});
  if (Object.keys(errors).length) return sendJson(res, 422, { error: 'Periksa kembali data Anda.', fields: errors });

  const now = new Date().toISOString();
  const order = {
    id: newOrderId(),
    status: XENDIT_SECRET_KEY ? 'PENDING' : 'RECEIVED',
    package_id: data.pkg.id,
    product_id: data.pkg.product_id,
    package_name: data.pkg.name,
    period: data.pkg.period,
    amount: data.pkg.price,
    currency: 'IDR',
    customer: { name: data.name, email: data.email, phone: data.phone, company: data.company },
    notes: data.notes,
    created_at: now
  };

  if (XENDIT_SECRET_KEY) {
    try {
      const inv = await createInvoice(order, data.pkg);
      order.invoice_id = inv.id;
      order.invoice_url = inv.invoice_url;
      order.invoice_expiry = inv.expiry_date || null;
    } catch (e) {
      console.error('Gagal membuat tagihan untuk ' + order.id + ': ' + e.message);
      return sendJson(res, 502, { error: 'Halaman pembayaran belum bisa dibuat. Silakan coba lagi, atau hubungi kami lewat WhatsApp.' });
    }
  }

  writeOrder(order);
  console.log('Pesanan baru: ' + order.id + ' | ' + order.package_name + ' | Rp' + order.amount +
    ' | ' + order.customer.name + ' | ' + order.status);
  return sendJson(res, 201, {
    id: order.id,
    status: order.status,
    redirect: order.invoice_url || '/pesanan?id=' + order.id
  });
}

async function handleOrder(req, res, id) {
  const order = readOrder(id);
  if (!order) return sendJson(res, 404, { error: 'Pesanan tidak ditemukan.' });
  // Bila webhook belum sampai, tanyakan status terbaru langsung ke Xendit
  // (paling sering sekali per 10 detik per pesanan).
  if (order.status === 'PENDING' && order.invoice_id && XENDIT_SECRET_KEY &&
      Date.now() - (order.checked_at || 0) > 10000) {
    try {
      order.checked_at = Date.now();
      applyInvoiceStatus(order, await fetchInvoice(order.invoice_id));
      writeOrder(order);
    } catch (e) {
      console.warn('Cek status ' + id + ' gagal: ' + e.message);
    }
  }
  return sendJson(res, 200, publicOrder(order));
}

async function handleWebhook(req, res) {
  if (!XENDIT_CALLBACK_TOKEN || !safeEqual(req.headers['x-callback-token'] || '', XENDIT_CALLBACK_TOKEN)) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  let inv;
  try { inv = JSON.parse(await readBody(req, 64 * 1024)); } catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
  const order = readOrder(String(inv.external_id || ''));
  if (!order) return sendJson(res, 200, { ok: true, ignored: 'unknown order' });
  if (order.invoice_id && inv.id && inv.id !== order.invoice_id) {
    return sendJson(res, 200, { ok: true, ignored: 'invoice mismatch' });
  }
  if (applyInvoiceStatus(order, inv)) writeOrder(order);
  return sendJson(res, 200, { ok: true });
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/checkout' && req.method === 'POST') return handleCheckout(req, res);
  if (pathname === '/api/xendit/webhook' && req.method === 'POST') return handleWebhook(req, res);
  const m = pathname.match(/^\/api\/orders\/([A-Za-z0-9-]{1,40})$/);
  if (m && req.method === 'GET') return handleOrder(req, res, m[1]);
  return sendJson(res, 404, { error: 'Not found' });
}

/* ==========================================================================
   Server
   ========================================================================== */
function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  // URL rapi: /checkout -> checkout.html
  else if (!path.extname(pathname)) pathname += '.html';

  // Tolak file tersembunyi dan usaha keluar dari folder public/
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT + path.sep) || pathname.split('/').some((seg) => seg.startsWith('.'))) {
    return notFound(req, res);
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return notFound(req, res);

    const ext = path.extname(file).toLowerCase();
    const etag = 'W/"' + stat.size.toString(16) + '-' + Math.floor(stat.mtimeMs).toString(16) + '"';
    const headers = Object.assign({
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': cacheControl(ext),
      'Last-Modified': stat.mtime.toUTCString(),
      ETag: etag
    }, SECURITY_HEADERS);

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  // www.<domain> -> <domain>, untuk tiap domain yang dilayani
  const host = String(req.headers.host || '').toLowerCase().split(':')[0];
  if (host.startsWith('www.') && APEX_HOSTS.includes(host.slice(4))) {
    res.writeHead(301, Object.assign({ Location: 'https://' + host.slice(4) + req.url }, SECURITY_HEADERS));
    return res.end();
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return sendText(res, 400, 'Bad request');
  }

  if (pathname === '/healthz') return sendText(res, 200, 'ok');
  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname).catch((e) => {
      console.error('API error ' + pathname + ': ' + e.stack);
      if (!res.headersSent) sendJson(res, 500, { error: 'Terjadi kesalahan di server. Silakan coba lagi.' });
    });
  }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log('MVD web: melayani ' + ROOT + ' di http://' + HOST + ':' + PORT
    + ' untuk ' + (APEX_HOSTS.join(', ') || '(host apa pun)'));
  console.log('Checkout: ' + (XENDIT_SECRET_KEY
    ? 'Xendit aktif (' + (XENDIT_SECRET_KEY.startsWith('xnd_development') ? 'mode TEST' : 'mode LIVE') + ')'
    : 'Xendit belum dikonfigurasi, pesanan disimpan tanpa tagihan') +
    ' | webhook ' + (XENDIT_CALLBACK_TOKEN ? 'aktif' : 'belum dikonfigurasi'));
});

// PM2 mengirim SIGINT saat restart/reload: tutup koneksi dengan rapi.
function shutdown(signal) {
  console.log(signal + ' diterima, server ditutup.');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
