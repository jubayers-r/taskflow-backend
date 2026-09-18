import client, { Counter, Gauge, Histogram, Registry } from 'prom-client';

export const metricsRegistry = new Registry();

// Process-level metrics (event loop, heap, GC, etc.) exposed with a prefix so
// multiple services can safely share one Prometheus instance.
client.collectDefaultMetrics({ register: metricsRegistry, prefix: 'taskflow_' });

export const httpRequestsTotal = new Counter({
  name: 'taskflow_http_requests_total',
  help: 'Total number of HTTP requests handled',
  labelNames: ['method', 'route', 'status_code', 'client'],
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'taskflow_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpInflightRequests = new Gauge({
  name: 'taskflow_http_inflight_requests',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method'],
  registers: [metricsRegistry],
});

/** Serializes the registry for the Prometheus text exposition format. */
export const collectMetrics = async (): Promise<string> => {
  return await metricsRegistry.metrics();
};
