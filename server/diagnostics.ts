import { monitorEventLoopDelay } from "perf_hooks";

const BYTES_TO_MIB = 1024 * 1024;
const LOG_INTERVAL_MS = 60_000;

type MemoryUsageSnapshot = Pick<
  NodeJS.MemoryUsage,
  "rss" | "heapTotal" | "heapUsed" | "external" | "arrayBuffers"
>;

export interface DiagnosticsSnapshot {
  timestamp: string;
  uptimeSeconds: number;
  memory: MemoryUsageSnapshot;
  memoryMiB: Record<keyof MemoryUsageSnapshot, number>;
  eventLoop?: {
    minMs: number;
    maxMs: number;
    meanMs: number;
    stddevMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
  };
  activeHandles?: number;
}

const asMiB = (value: number): number => Number((value / BYTES_TO_MIB).toFixed(2));

const toMemoryMiB = (memory: MemoryUsageSnapshot): Record<keyof MemoryUsageSnapshot, number> => ({
  rss: asMiB(memory.rss),
  heapTotal: asMiB(memory.heapTotal),
  heapUsed: asMiB(memory.heapUsed),
  external: asMiB(memory.external),
  arrayBuffers: asMiB(memory.arrayBuffers),
});

const safeMs = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Number((value / 1e6).toFixed(2));
};

const toEventLoopStats = (histogram: ReturnType<typeof monitorEventLoopDelay>) => ({
  minMs: safeMs(histogram.min),
  maxMs: safeMs(histogram.max),
  meanMs: safeMs(histogram.mean),
  stddevMs: safeMs(histogram.stddev),
  p50Ms: safeMs(histogram.percentile(50)),
  p95Ms: safeMs(histogram.percentile(95)),
  p99Ms: safeMs(histogram.percentile(99)),
});

const eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
eventLoopHistogram.enable();

export function getDiagnosticsSnapshot(includeEventLoop = true): DiagnosticsSnapshot {
  const memory: MemoryUsageSnapshot = process.memoryUsage();

  const snapshot: DiagnosticsSnapshot = {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Number(process.uptime().toFixed(2)),
    memory,
    memoryMiB: toMemoryMiB(memory),
  };

  if (includeEventLoop) {
    snapshot.eventLoop = toEventLoopStats(eventLoopHistogram);

    const getActiveHandles = (process as any)._getActiveHandles as (() => unknown[]) | undefined;
    if (typeof getActiveHandles === "function") {
      snapshot.activeHandles = getActiveHandles().length;
    }
  }

  return snapshot;
}

const deltaMiB = (current: number, previous: number): string => {
  const delta = current - previous;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)} MiB`;
};

const diagnosticsLoggingEnabled = (): boolean => {
  const flag = process.env.ENABLE_DIAGNOSTICS_LOGS?.toLowerCase();
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;

  return process.env.NODE_ENV !== "production";
};

export function startDiagnosticsLogging(logger: (line: string) => void): void {
  if (!diagnosticsLoggingEnabled()) {
    return;
  }

  let previous = getDiagnosticsSnapshot(false);

  const timer = setInterval(() => {
    const current = getDiagnosticsSnapshot(false);

    logger(
      `[diagnostics] ${current.timestamp} rss=${current.memoryMiB.rss.toFixed(2)} MiB (${deltaMiB(current.memoryMiB.rss, previous.memoryMiB.rss)}), ` +
      `heapUsed=${current.memoryMiB.heapUsed.toFixed(2)} MiB (${deltaMiB(current.memoryMiB.heapUsed, previous.memoryMiB.heapUsed)}), ` +
      `heapTotal=${current.memoryMiB.heapTotal.toFixed(2)} MiB (${deltaMiB(current.memoryMiB.heapTotal, previous.memoryMiB.heapTotal)}), ` +
      `external=${current.memoryMiB.external.toFixed(2)} MiB (${deltaMiB(current.memoryMiB.external, previous.memoryMiB.external)}), ` +
      `arrayBuffers=${current.memoryMiB.arrayBuffers.toFixed(2)} MiB (${deltaMiB(current.memoryMiB.arrayBuffers, previous.memoryMiB.arrayBuffers)})`
    );

    previous = current;
  }, LOG_INTERVAL_MS);

  timer.unref();
}
