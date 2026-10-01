// Konfigurasi PM2 untuk mitravisidigital.com
// Jalankan: pm2 start ecosystem.config.cjs   (detail di DEPLOY.md)
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
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3200,
        CANONICAL_HOST: 'mitravisidigital.com'
      }
    }
  ]
};
