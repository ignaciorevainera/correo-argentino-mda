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
      watch: false
    }
  ],
};
