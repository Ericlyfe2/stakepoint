/**
 * In-process metrics ring buffer for the admin Health dashboard.
 *
 * Records per-minute aggregates for the last 24 hours so the admin UI can
 * draw uptime, p95 latency, error rate, and odds-feed lag charts without
 * touching a TSDB. Memory cost: ~1440 buckets × a few numbers ≈ trivial.
 *
 * The Express middleware `recordRequest` updates the current bucket on
 * every API request; oddsAggregator calls `recordOddsLag` after each
 * upstream poll. The endpoint reader copies the buffer atomically so a
 * concurrent write can't tear the response.
 */

const BUCKET_MS    = 60 * 1000;          // one bucket per minute
const WINDOW_MIN   = 24 * 60;             // 24 hours of buckets
const buckets = new Map();                // bucketKey -> aggregate

function bucketKey(t = Date.now()) {
  return Math.floor(t / BUCKET_MS) * BUCKET_MS;
}

function getBucket(key) {
  let b = buckets.get(key);
  if (!b) {
    b = {
      t: key,
      reqCount: 0,
      errCount: 0,         // status >= 500
      clientErrCount: 0,   // 400..499
      latencyMs: [],       // sample list, capped per bucket
      oddsLagMs: [],
    };
    buckets.set(key, b);
    pruneOld(key);
  }
  return b;
}

function pruneOld(latestKey) {
  const cutoff = latestKey - WINDOW_MIN * BUCKET_MS;
  for (const k of buckets.keys()) if (k < cutoff) buckets.delete(k);
}

const LATENCY_SAMPLE_CAP = 200;
const ODDS_SAMPLE_CAP    = 30;

export function recordRequest(latencyMs, statusCode) {
  const b = getBucket(bucketKey());
  b.reqCount++;
  if (b.latencyMs.length < LATENCY_SAMPLE_CAP) b.latencyMs.push(latencyMs);
  if (statusCode >= 500) b.errCount++;
  else if (statusCode >= 400) b.clientErrCount++;
}

export function recordOddsLag(lagMs) {
  const b = getBucket(bucketKey());
  if (b.oddsLagMs.length < ODDS_SAMPLE_CAP) b.oddsLagMs.push(lagMs);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarizeBucket(b) {
  const sorted = [...b.latencyMs].sort((a, z) => a - z);
  const oddsSorted = [...b.oddsLagMs].sort((a, z) => a - z);
  return {
    t: b.t,
    reqs: b.reqCount,
    errs: b.errCount,
    clientErrs: b.clientErrCount,
    errorRate: b.reqCount ? Number((b.errCount / b.reqCount).toFixed(4)) : 0,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    oddsP50Ms: percentile(oddsSorted, 50),
    oddsMaxMs: oddsSorted[oddsSorted.length - 1] || 0,
  };
}

export function getMetricsWindow() {
  const now = Date.now();
  const newest = bucketKey(now);
  const out = [];
  for (let i = WINDOW_MIN - 1; i >= 0; i--) {
    const k = newest - i * BUCKET_MS;
    const b = buckets.get(k);
    out.push(b
      ? summarizeBucket(b)
      : { t: k, reqs: 0, errs: 0, clientErrs: 0, errorRate: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, oddsP50Ms: 0, oddsMaxMs: 0 });
  }
  // 24-hour roll-ups for the headline tiles.
  const total = out.reduce((s, r) => ({
    reqs: s.reqs + r.reqs,
    errs: s.errs + r.errs,
    clientErrs: s.clientErrs + r.clientErrs,
  }), { reqs: 0, errs: 0, clientErrs: 0 });

  const allLatencies = [];
  for (const b of buckets.values()) for (const v of b.latencyMs) allLatencies.push(v);
  allLatencies.sort((a, z) => a - z);

  const allOddsLags = [];
  for (const b of buckets.values()) for (const v of b.oddsLagMs) allOddsLags.push(v);
  allOddsLags.sort((a, z) => a - z);

  // Uptime: minutes in the window with >0 successful requests, as % of
  // minutes that had any activity at all. Idle minutes don't count
  // against uptime — they aren't downtime, they're quiet periods.
  const activeBuckets = out.filter((r) => r.reqs > 0);
  const goodBuckets   = activeBuckets.filter((r) => r.errs === 0);
  const uptimePct = activeBuckets.length
    ? Number(((goodBuckets.length / activeBuckets.length) * 100).toFixed(2))
    : 100;

  return {
    windowMinutes: WINDOW_MIN,
    bucketMs: BUCKET_MS,
    generatedAt: new Date(now).toISOString(),
    buckets: out,
    summary: {
      requests24h: total.reqs,
      errors24h: total.errs,
      clientErrors24h: total.clientErrs,
      errorRate24h: total.reqs ? Number((total.errs / total.reqs).toFixed(4)) : 0,
      p50Ms: percentile(allLatencies, 50),
      p95Ms: percentile(allLatencies, 95),
      p99Ms: percentile(allLatencies, 99),
      uptimePct,
      oddsP50Ms: percentile(allOddsLags, 50),
      oddsP95Ms: percentile(allOddsLags, 95),
      oddsMaxMs: allOddsLags[allOddsLags.length - 1] || 0,
      oddsSamples: allOddsLags.length,
    },
  };
}

/** Express middleware: records request latency + status code. */
export function metricsMiddleware(req, res, next) {
  // Skip non-API noise — keeps the histogram tight to the API surface.
  if (!req.path.startsWith('/api')) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ns = Number(process.hrtime.bigint() - start);
    recordRequest(ns / 1e6, res.statusCode || 0);
  });
  next();
}
