// A simple in-memory, per-process rate limiter — no new infra/dependency
// (Redis, Upstash) needed, which matters here: this service runs a single
// replica on Railway (numReplicas: 1), so a per-process counter behaves
// exactly like a shared one would. If this service is ever scaled to
// multiple replicas, each would track its own counters independently
// (effectively multiplying the limit by replica count) — fine for this
// app's current scale, but worth swapping for a shared store (e.g. Upstash
// Redis) if that ever changes. Resets on every deploy/restart, which is
// acceptable for its purpose here: smoothing out abuse/accidental bursts,
// not enforcing a hard long-term quota.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Keeps the map from growing without bound across many distinct keys (e.g.
// many different users) over a long-running process — cheap to run on every
// call since it only does real work once the map has grown past a
// threshold, and only ever removes buckets that have already expired.
function sweepExpired(now: number) {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

// Fixed-window limiter: at most `limit` calls per `windowMs` for a given
// key. Returns how many seconds to wait before retrying when the limit is
// hit, so callers can surface a concrete "try again in Xs" message instead
// of a bare rejection.
export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  sweepExpired(now);
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true };
}
