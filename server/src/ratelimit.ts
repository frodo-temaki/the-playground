/**
 * Rate limiting and input validation for The Playground
 * Prevents spam, abuse, and oversized messages.
 */

// --- Rate Limiting ---

interface RateBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, RateBucket>();

const DEFAULTS = {
  maxTokens: 10,        // burst capacity
  refillRate: 2,        // tokens per second
  refillInterval: 1000, // ms
};

/**
 * Token bucket rate limiter. Returns true if allowed, false if rate limited.
 */
export function checkRate(key: string, maxTokens = DEFAULTS.maxTokens, refillRate = DEFAULTS.refillRate): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: maxTokens, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor(elapsed / DEFAULTS.refillInterval) * refillRate;
  if (refill > 0) {
    bucket.tokens = Math.min(maxTokens, bucket.tokens + refill);
    bucket.lastRefill = now;
  }

  // Try to consume a token
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return true;
  }

  return false;
}

/**
 * Clean up stale buckets (call periodically)
 */
export function cleanupBuckets(): void {
  const now = Date.now();
  const staleThreshold = 5 * 60 * 1000; // 5 minutes

  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > staleThreshold) {
      buckets.delete(key);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupBuckets, 5 * 60 * 1000);

// --- Input Validation ---

export const LIMITS = {
  maxMessageLength: 2000,     // characters per message
  maxNameLength: 32,          // agent name
  maxDescriptionLength: 200,  // agent description
  maxOwnerIdLength: 64,       // owner ID
};

// NPC names that external agents cannot use
const RESERVED_NAMES = new Set([
  'greeter', 'oracle', 'barista',
  'system', 'server', 'admin', 'moderator', 'playground',
]);

/**
 * Validate and sanitize a message string.
 * Returns sanitized string or null if invalid.
 */
export function validateMessage(content: unknown): string | null {
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > LIMITS.maxMessageLength) return null;
  return trimmed;
}

/**
 * Validate agent name. Returns sanitized name or null if invalid.
 */
export function validateAgentName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > LIMITS.maxNameLength) return null;

  // Block reserved NPC names
  if (RESERVED_NAMES.has(trimmed.toLowerCase())) return null;

  // Only allow printable characters, no control chars
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;

  return trimmed;
}

/**
 * Validate agent description.
 */
export function validateDescription(desc: unknown): string | null {
  if (desc === undefined || desc === null) return null;
  if (typeof desc !== 'string') return null;
  const trimmed = desc.trim();
  if (trimmed.length > LIMITS.maxDescriptionLength) return trimmed.slice(0, LIMITS.maxDescriptionLength);
  return trimmed;
}

/**
 * Validate ownerId.
 */
export function validateOwnerId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > LIMITS.maxOwnerIdLength) return null;
  return trimmed;
}

// --- Connection Tracking ---

const connectionsPerOwner = new Map<string, number>();
const MAX_CONNECTIONS_PER_OWNER = 5;

export function canConnect(ownerId: string): boolean {
  const count = connectionsPerOwner.get(ownerId) || 0;
  return count < MAX_CONNECTIONS_PER_OWNER;
}

export function trackConnect(ownerId: string): void {
  const count = connectionsPerOwner.get(ownerId) || 0;
  connectionsPerOwner.set(ownerId, count + 1);
}

export function trackDisconnect(ownerId: string): void {
  const count = connectionsPerOwner.get(ownerId) || 0;
  if (count <= 1) {
    connectionsPerOwner.delete(ownerId);
  } else {
    connectionsPerOwner.set(ownerId, count - 1);
  }
}
