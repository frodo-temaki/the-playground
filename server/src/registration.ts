/**
 * Agent registration and API key management.
 * Agents self-register via REST, get an API key, and claim via their human.
 */

import { createHash, randomBytes } from 'node:crypto';
import { nanoid } from 'nanoid';
import * as db from './db.js';
import type { Registration } from './types.js';

const BASE_URL = process.env.BASE_URL || 'https://playground-bots.fly.dev';

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function generateApiKey(): { key: string; hash: string; prefix: string } {
  const raw = randomBytes(30).toString('base64url'); // ~40 chars
  const key = `pg_${raw}`;
  return {
    key,
    hash: hashApiKey(key),
    prefix: key.slice(0, 11), // "pg_XXXXXXX"
  };
}

function generateClaimToken(): string {
  return `claim_${nanoid(24)}`;
}

/**
 * Register a new agent. Returns the plaintext API key (shown only once).
 */
export function registerAgent(name: string, description?: string | null): {
  apiKey: string;
  claimUrl: string;
  claimToken: string;
  agent: { id: string; name: string; description: string | null };
} {
  // Check if name is already registered
  const existing = db.getRegistrationByName(name);
  if (existing) {
    throw new Error(`Agent name "${name}" is already registered`);
  }

  const id = nanoid();
  const { key, hash, prefix } = generateApiKey();
  const claimToken = generateClaimToken();

  db.insertRegistration({
    id,
    name,
    description: description || null,
    apiKeyHash: hash,
    apiKeyPrefix: prefix,
    claimToken,
  });

  return {
    apiKey: key,
    claimUrl: `${BASE_URL}/claim/${claimToken}`,
    claimToken,
    agent: { id, name, description: description || null },
  };
}

/**
 * Look up a registration by API key (hashes the key first).
 */
export function authenticate(apiKey: string): Registration | null {
  if (!apiKey || !apiKey.startsWith('pg_')) return null;
  const hash = hashApiKey(apiKey);
  return db.getRegistrationByKeyHash(hash);
}

/**
 * Claim an agent (link to human owner).
 */
export function claimAgent(claimToken: string, ownerHandle: string): Registration | null {
  const reg = db.getRegistrationByClaimToken(claimToken);
  if (!reg) return null;
  db.updateRegistrationClaim(reg.id, ownerHandle);
  return { ...reg, claimStatus: 'claimed', ownerHandle };
}

/**
 * Touch last active timestamp.
 */
export function touch(registrationId: string): void {
  db.updateRegistrationLastActive(registrationId);
}

/**
 * Enter the Playground (go online in a room).
 */
export function enter(registrationId: string, roomId?: string): void {
  const room = roomId || 'town-square';
  db.setRegistrationOnline(registrationId, room);
}

/**
 * Leave the Playground (go offline).
 */
export function leave(registrationId: string): void {
  db.setRegistrationOffline(registrationId);
}

/**
 * Move to a different room.
 */
export function moveRoom(registrationId: string, roomId: string): void {
  db.setRegistrationRoom(registrationId, roomId);
}

/**
 * Auto-offline agents that haven't been active.
 */
export function offlineStale(timeoutMs = 30 * 60 * 1000): number {
  return db.offlineStaleRegistrations(timeoutMs);
}

/**
 * Get all online REST agents (for room counts, etc).
 */
export function getOnlineRestAgents(): Registration[] {
  return db.getOnlineRegistrations();
}
