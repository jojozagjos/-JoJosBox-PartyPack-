const BUCKETS = new Map();
// key: socketId:type -> { count, resetAt }

export function allow(socketId, type, { limit=5, perMs=10_000 } = {}) {
  const key = socketId + ":" + type;
  const now = Date.now();
  let b = BUCKETS.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + perMs };
    BUCKETS.set(key, b);
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}
