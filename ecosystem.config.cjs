module.exports = {
  apps: [
    {
      name: "correo-argentino-mda",
      script: "./dist/server/entry.mjs",
      env: {
        NODE_ENV: "production",
        PORT: 4321,
      },
    },
    {
      name: "mda-ping-cubics",
      script: "node",
      args: "--import tsx scripts/ping-worker.ts",
      autorestart: true,
      watch: false,
    },
    {
      name: "sync-legacy-inventory",
      script: "node",
      args: "--import tsx scripts/sync-legacy-inventory.ts",
      cron_restart: "0 5,17 * * *",
      autorestart: false,
      watch: false,
      error_file: "./logs/sync-error.log",
      out_file: "./logs/sync-out.log",
    },
  ],
};
