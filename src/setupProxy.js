const { createProxyMiddleware } = require("http-proxy-middleware");

const DEV_API_TARGET = process.env.REACT_APP_API_PROXY_TARGET || "http://localhost:5050";

module.exports = function setupProxy(app) {
  app.use(
    "/api/notifications/stream",
    createProxyMiddleware({
      target: DEV_API_TARGET,
      changeOrigin: true,
      ws: false,
      proxyTimeout: 0,
      timeout: 0,
      onProxyReq(proxyReq) {
        proxyReq.setHeader("Connection", "keep-alive");
        proxyReq.setHeader("Accept", "text/event-stream");
        proxyReq.setHeader("Cache-Control", "no-cache");
      },
      onProxyRes(proxyRes) {
        proxyRes.headers["cache-control"] = "no-cache, no-transform";
        proxyRes.headers["x-accel-buffering"] = "no";
      },
    })
  );
};
