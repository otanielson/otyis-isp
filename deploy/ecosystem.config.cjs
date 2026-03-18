module.exports = {
  apps: [
    {
      name: "multi-portal",
      script: "dist/server.js",
      cwd: __dirname + "/..",
      env: {
        NODE_ENV: "production"
      },
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "500M"
    }
  ]
}
