// Used by Docker HEALTHCHECK — must exit 0 (healthy) or 1 (unhealthy)
// Does NOT call the HTTP server (avoids port dependency in health check)
const http = require('http');

const req = http.get('http://localhost:3000/health/live', (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on('error', () => process.exit(1));
req.setTimeout(5000, () => {
  req.destroy();
  process.exit(1);
});
