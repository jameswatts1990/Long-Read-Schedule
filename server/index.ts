import express, { type Request, Response, NextFunction } from "express";
import { writeHeapSnapshot } from "v8";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeDatabase } from "./init-db";
import { startDiagnosticsLogging } from "./diagnostics";

const app = express();

const BYTES_TO_MIB = 1024 * 1024;

const parseEnvNumber = (value: string | undefined): number | null => {
  if (value == null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const parseEnvBoolean = (value: string | undefined): boolean | null => {
  if (value == null || value.trim() === "") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }

  return null;
};

interface RuntimeGuardrailConfig {
  enabled: boolean;
  warningRssMb: number | null;
  criticalRssMb: number | null;
  monitorIntervalMs: number;
  snapshotEnabled: boolean;
}

const getRuntimeGuardrailConfig = (): RuntimeGuardrailConfig => {
  const guardrailsEnabled = parseEnvBoolean(process.env.RUNTIME_GUARDRAILS_ENABLED);
  const warningRssMb = parseEnvNumber(process.env.RUNTIME_RSS_WARNING_MB);
  const criticalRssMb = parseEnvNumber(process.env.RUNTIME_RSS_CRITICAL_MB);
  const monitorIntervalMs = parseEnvNumber(process.env.RUNTIME_GUARDRAIL_INTERVAL_MS) ?? 30_000;
  const snapshotFlag = parseEnvBoolean(process.env.RUNTIME_HEAP_SNAPSHOT_ON_CRITICAL);

  return {
    enabled: guardrailsEnabled ?? process.env.NODE_ENV === "production",
    warningRssMb,
    criticalRssMb,
    monitorIntervalMs,
    snapshotEnabled: snapshotFlag ?? process.env.NODE_ENV !== "production",
  };
};

const getCurrentRssMb = (): number => Number((process.memoryUsage().rss / BYTES_TO_MIB).toFixed(2));

const setupRuntimeGuardrails = (server: ReturnType<typeof registerRoutes> extends Promise<infer T> ? T : never): void => {
  const config = getRuntimeGuardrailConfig();

  if (!config.enabled) {
    log("[runtime-guardrails] disabled");
    return;
  }

  if (config.warningRssMb == null && config.criticalRssMb == null) {
    log("[runtime-guardrails] enabled with no thresholds configured; skipping monitor setup");
    return;
  }

  if (
    config.warningRssMb != null &&
    config.criticalRssMb != null &&
    config.warningRssMb >= config.criticalRssMb
  ) {
    log(
      `[runtime-guardrails] invalid config: warning threshold (${config.warningRssMb} MiB) must be lower than critical threshold (${config.criticalRssMb} MiB)`
    );
    return;
  }

  let hasLoggedWarning = false;
  let restartInProgress = false;

  const createHeapSnapshotIfEnabled = (rssMb: number): void => {
    if (!config.snapshotEnabled) {
      return;
    }

    try {
      const snapshotPath = writeHeapSnapshot();
      log(`[runtime-guardrails] heap snapshot generated at ${snapshotPath} after rss=${rssMb.toFixed(2)} MiB`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[runtime-guardrails] failed to write heap snapshot: ${message}`);
    }
  };

  const triggerGracefulShutdown = (rssMb: number): void => {
    if (restartInProgress) {
      return;
    }

    restartInProgress = true;
    createHeapSnapshotIfEnabled(rssMb);

    log(
      `[runtime-guardrails] critical rss threshold reached (${rssMb.toFixed(2)} MiB). Starting graceful shutdown for process manager recovery.`
    );

    const forceExitTimer = setTimeout(() => {
      log("[runtime-guardrails] graceful shutdown timed out, forcing process exit");
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    server.close((error) => {
      if (error) {
        log(`[runtime-guardrails] server close error: ${error.message}`);
      } else {
        log("[runtime-guardrails] server closed, exiting for restart");
      }
      process.exit(1);
    });
  };

  const monitorTimer = setInterval(() => {
    const rssMb = getCurrentRssMb();

    if (config.criticalRssMb != null && rssMb >= config.criticalRssMb) {
      triggerGracefulShutdown(rssMb);
      return;
    }

    if (config.warningRssMb != null && rssMb >= config.warningRssMb) {
      if (!hasLoggedWarning) {
        hasLoggedWarning = true;
        log(
          `[runtime-guardrails] warning rss threshold reached (${rssMb.toFixed(2)} MiB >= ${config.warningRssMb.toFixed(2)} MiB)`
        );
      }
      return;
    }

    if (hasLoggedWarning) {
      hasLoggedWarning = false;
      log(`[runtime-guardrails] rss recovered to ${rssMb.toFixed(2)} MiB`);
    }
  }, config.monitorIntervalMs);

  monitorTimer.unref();

  log(
    `[runtime-guardrails] enabled (warning=${config.warningRssMb ?? "off"} MiB, critical=${config.criticalRssMb ?? "off"} MiB, interval=${config.monitorIntervalMs}ms, heapSnapshotOnCritical=${config.snapshotEnabled})`
  );
};

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

(async () => {
  await initializeDatabase();
  const server = await registerRoutes(app);
  startDiagnosticsLogging(log);
  setupRuntimeGuardrails(server);

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
