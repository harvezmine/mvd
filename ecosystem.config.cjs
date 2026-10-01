// Konfigurasi PM2 untuk mitravisidigital.com
// Jalankan: pm2 start ecosystem.config.cjs   (detail di DEPLOY.md)
//
// Nilai di $MVD_APP_DIR/.env.production (default /var/www/mvd) menimpa env
// di bawah, mis. HOST=172.18.0.1 supaya cloudflared di Docker bisa menjangkau.
const fs = require('node:fs');
const path = require('node:path');

const APP_DIR = process.env.MVD_APP_DIR || '/var/www/mvd';
const ENV_FILE = path.join(APP_DIR, '.env.production');

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

module.exports = {
  apps: [
    {
      name: 'mvd-web',
      script: 'server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '150M',
      kill_timeout: 6000,
      time: true,
      env: Object.assign({
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3200,
        CANONICAL_HOST: 'mitravisidigital.com'
      }, readEnvFile(ENV_FILE))
    }
  ]
};
