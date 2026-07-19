/**
 * Best-effort per-user rate limit for /api/mcp. In-memory only — on Vercel
 * fluid compute this state lives per warm instance, not globally, so it's a
 * speed bump against a runaway/looping agent rather than a hard guarantee.
 * Good enough for this surface: a handful of trusted, individually-issued
 * tokens, not a public API. A real cross-instance limiter (Firestore- or
 * Redis-backed) would be the next step if that stops being true.
 */
type Verdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

function createLimiter(windowMs: number, maxRequests: number) {
  const windows = new Map<string, { windowStart: number; count: number }>();
  return (key: string): Verdict => {
    const now = Date.now();
    const existing = windows.get(key);

    if (!existing || now - existing.windowStart >= windowMs) {
      windows.set(key, { windowStart: now, count: 1 });
      return { allowed: true };
    }

    if (existing.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((existing.windowStart + windowMs - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    existing.count++;
    return { allowed: true };
  };
}

const mcpLimiter = createLimiter(60_000, 60);
export function checkRateLimit(userId: number): Verdict {
  return mcpLimiter(String(userId));
}

// Login checks real passwords and is unauthenticated by nature — tighter
// window, keyed by IP since there's no user identity until credentials check
// out. Same in-memory/per-instance caveat as checkRateLimit above.
const loginLimiter = createLimiter(10 * 60_000, 10);
export function checkLoginRateLimit(ip: string): Verdict {
  return loginLimiter(ip);
}
