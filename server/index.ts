import express, { type Request, Response, NextFunction } from "express";
import type { Server as HttpServer } from "http";
import type { Server as SocketServer } from "socket.io";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeDatabase } from "./init-db";
import { getAuthDiagnostics } from "./replitAuth";

const app = express();

const ENABLE_MEMORY_DIAGNOSTICS = process.env.ENABLE_MEMORY_DIAGNOSTICS === "true";
const MEMORY_DIAGNOSTICS_INTERVAL_MS = Math.max(
  Number.parseInt(process.env.MEMORY_DIAGNOSTICS_INTERVAL_MS ?? "60000", 10) || 60000,
  10000,
);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '10mb', extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

function setupMemoryDiagnostics(server: HttpServer) {
  if (!ENABLE_MEMORY_DIAGNOSTICS) {
    return;
  }

  const socketServer = (server as HttpServer & { socketServer?: SocketServer }).socketServer;

  const interval = setInterval(() => {
    const memory = process.memoryUsage();

    const activeHandlesCount = typeof (process as any)._getActiveHandles === "function"
      ? (process as any)._getActiveHandles().length
      : null;

    const activeRequestsCount = typeof (process as any)._getActiveRequests === "function"
      ? (process as any)._getActiveRequests().length
      : null;

    const diagnosticsLog = {
      event: "runtime.memory_diagnostics",
      ts: new Date().toISOString(),
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      memoryBytes: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
      },
      runtime: {
        activeHandlesCount,
        activeRequestsCount,
      },
      auth: getAuthDiagnostics(),
      sockets: {
        connectionCount: socketServer?.engine.clientsCount ?? null,
      },
    };

    log(JSON.stringify(diagnosticsLog));
  }, MEMORY_DIAGNOSTICS_INTERVAL_MS);

  interval.unref();

  log(
    JSON.stringify({
      event: "runtime.memory_diagnostics_enabled",
      ts: new Date().toISOString(),
      intervalMs: MEMORY_DIAGNOSTICS_INTERVAL_MS,
    }),
  );
}

(async () => {
  await initializeDatabase();
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  setupMemoryDiagnostics(server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
