/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "erp-api",
      script: "./artifacts/api-server/dist/index.mjs",
      interpreter: "node",
      interpreter_args: "--enable-source-maps",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      error_file: "./logs/erp-api-error.log",
      out_file: "./logs/erp-api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
