'use strict';
/* ==========================================================================
   Server statis mitravisidigital.com
   Hanya modul bawaan Node (tanpa npm install). Dijalankan oleh PM2 dan
   diekspos ke internet lewat Cloudflare Tunnel, jadi cukup mendengarkan
   di 127.0.0.1. Yang disajikan hanya isi folder public/.
   ========================================================================== */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3200;
const HOST = process.env.HOST || '127.0.0.1';
// Domain utama. Permintaan ke www.<domain> dialihkan ke sini (301).
const CANONICAL_HOST = (process.env.CANONICAL_HOST || '').toLowerCase();

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

// HTML, CSS, dan JS selalu divalidasi ulang (ETag -> 304 bila tidak berubah),
// jadi perubahan langsung terlihat; gambar cache sehari (nama file tidak di-hash).
function cacheControl(ext) {
  if (ext === '.html') return 'no-cache';
  if (ext === '.css' || ext === '.js') return 'no-cache';
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

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }

  // www.mitravisidigital.com -> mitravisidigital.com
  const host = String(req.headers.host || '').toLowerCase().split(':')[0];
  if (CANONICAL_HOST && host === 'www.' + CANONICAL_HOST) {
    res.writeHead(301, Object.assign({ Location: 'https://' + CANONICAL_HOST + req.url }, SECURITY_HEADERS));
    return res.end();
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return sendText(res, 400, 'Bad request');
  }

  if (pathname === '/healthz') return sendText(res, 200, 'ok');
  if (pathname.endsWith('/')) pathname += 'index.html';

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
});

server.listen(PORT, HOST, () => {
  console.log('mitravisidigital.com: melayani ' + ROOT + ' di http://' + HOST + ':' + PORT);
});

// PM2 mengirim SIGINT saat restart/reload: tutup koneksi dengan rapi.
function shutdown(signal) {
  console.log(signal + ' diterima, server ditutup.');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
