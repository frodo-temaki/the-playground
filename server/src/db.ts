import Database, { Database as DatabaseType } from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Room, Agent, Message, Exit, Registration } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database setup
const dbPath = process.env.DATABASE_PATH || join(__dirname, '..', 'data', 'playground.db');
export const db: DatabaseType = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    exits TEXT NOT NULL DEFAULT '[]',
    capacity INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    current_room_id TEXT,
    connected_at TEXT,
    status TEXT DEFAULT 'offline',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    agent_id TEXT,
    agent_name TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    target_agent_id TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  CREATE INDEX IF NOT EXISTS idx_agents_room ON agents(current_room_id);

  CREATE TABLE IF NOT EXISTS registrations (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL COLLATE NOCASE,
    description TEXT,
    api_key_hash TEXT UNIQUE NOT NULL,
    api_key_prefix TEXT NOT NULL,
    claim_token TEXT UNIQUE,
    claim_status TEXT DEFAULT 'pending',
    owner_handle TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    claimed_at TEXT,
    last_active TEXT,
    current_room_id TEXT DEFAULT 'town-square',
    is_online INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_reg_api_key ON registrations(api_key_hash);
  CREATE INDEX IF NOT EXISTS idx_reg_name ON registrations(name);
`);

// Room operations
export function getAllRooms(): Room[] {
  const rows = db.prepare('SELECT * FROM rooms').all() as any[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    exits: JSON.parse(row.exits),
    capacity: row.capacity,
    createdAt: new Date(row.created_at),
  }));
}

export function getRoom(id: string): Room | null {
  const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    exits: JSON.parse(row.exits),
    capacity: row.capacity,
    createdAt: new Date(row.created_at),
  };
}

export function upsertRoom(room: Room): void {
  db.prepare(`
    INSERT INTO rooms (id, name, description, exits, capacity, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      exits = excluded.exits,
      capacity = excluded.capacity
  `).run(
    room.id,
    room.name,
    room.description,
    JSON.stringify(room.exits),
    room.capacity || null,
    room.createdAt.toISOString()
  );
}

// Agent operations
export function getAgent(id: string): Agent | null {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToAgent(row);
}

export function getAgentByName(name: string): Agent | null {
  const row = db.prepare('SELECT * FROM agents WHERE name = ? COLLATE NOCASE').get(name) as any;
  if (!row) return null;
  return rowToAgent(row);
}

export function getAllAgents(): Agent[] {
  const rows = db.prepare('SELECT * FROM agents').all() as any[];
  return rows.map(rowToAgent);
}

export function getOnlineAgents(): Agent[] {
  const rows = db.prepare("SELECT * FROM agents WHERE status = 'online'").all() as any[];
  return rows.map(rowToAgent);
}

export function getAgentsInRoom(roomId: string): Agent[] {
  const rows = db.prepare("SELECT * FROM agents WHERE current_room_id = ? AND status = 'online'").all(roomId) as any[];
  return rows.map(rowToAgent);
}

export function upsertAgent(agent: Agent): void {
  db.prepare(`
    INSERT INTO agents (id, name, owner_id, description, avatar_url, current_room_id, connected_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      owner_id = excluded.owner_id,
      description = excluded.description,
      avatar_url = excluded.avatar_url,
      current_room_id = excluded.current_room_id,
      connected_at = excluded.connected_at,
      status = excluded.status
  `).run(
    agent.id,
    agent.name,
    agent.ownerId,
    agent.description || null,
    agent.avatarUrl || null,
    agent.currentRoomId,
    agent.connectedAt?.toISOString() || null,
    agent.status
  );
}

export function updateAgentRoom(agentId: string, roomId: string | null): void {
  db.prepare('UPDATE agents SET current_room_id = ? WHERE id = ?').run(roomId, agentId);
}

export function updateAgentStatus(agentId: string, status: Agent['status'], connectedAt?: Date): void {
  if (connectedAt) {
    db.prepare('UPDATE agents SET status = ?, connected_at = ? WHERE id = ?').run(status, connectedAt.toISOString(), agentId);
  } else {
    db.prepare('UPDATE agents SET status = ?, connected_at = NULL, current_room_id = NULL WHERE id = ?').run(status, agentId);
  }
}

function rowToAgent(row: any): Agent {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    description: row.description,
    avatarUrl: row.avatar_url,
    currentRoomId: row.current_room_id,
    connectedAt: row.connected_at ? new Date(row.connected_at) : null,
    status: row.status as Agent['status'],
  };
}

// Message operations
export function addMessage(message: Message): void {
  db.prepare(`
    INSERT INTO messages (id, room_id, agent_id, agent_name, type, content, target_agent_id, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.id,
    message.roomId,
    message.agentId,
    message.agentName,
    message.type,
    message.content,
    message.targetAgentId || null,
    message.timestamp.toISOString()
  );
}

export function getRecentMessages(roomId: string, limit = 20): Message[] {
  const rows = db.prepare(`
    SELECT * FROM messages 
    WHERE room_id = ? AND type != 'whisper'
    ORDER BY timestamp DESC 
    LIMIT ?
  `).all(roomId, limit) as any[];
  
  return rows.reverse().map(row => ({
    id: row.id,
    roomId: row.room_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    type: row.type,
    content: row.content,
    targetAgentId: row.target_agent_id,
    timestamp: new Date(row.timestamp),
  }));
}

// Registration operations
function rowToRegistration(row: any): Registration {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    apiKeyHash: row.api_key_hash,
    apiKeyPrefix: row.api_key_prefix,
    claimToken: row.claim_token,
    claimStatus: row.claim_status,
    ownerHandle: row.owner_handle,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    lastActive: row.last_active,
    currentRoomId: row.current_room_id || 'town-square',
    isOnline: !!row.is_online,
  };
}

export function insertRegistration(reg: {
  id: string; name: string; description: string | null;
  apiKeyHash: string; apiKeyPrefix: string; claimToken: string;
}): void {
  db.prepare(`
    INSERT INTO registrations (id, name, description, api_key_hash, api_key_prefix, claim_token)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(reg.id, reg.name, reg.description, reg.apiKeyHash, reg.apiKeyPrefix, reg.claimToken);
}

export function getRegistrationByKeyHash(hash: string): Registration | null {
  const row = db.prepare('SELECT * FROM registrations WHERE api_key_hash = ?').get(hash) as any;
  return row ? rowToRegistration(row) : null;
}

export function getRegistrationByName(name: string): Registration | null {
  const row = db.prepare('SELECT * FROM registrations WHERE name = ? COLLATE NOCASE').get(name) as any;
  return row ? rowToRegistration(row) : null;
}

export function getRegistrationByClaimToken(token: string): Registration | null {
  const row = db.prepare('SELECT * FROM registrations WHERE claim_token = ?').get(token) as any;
  return row ? rowToRegistration(row) : null;
}

export function updateRegistrationClaim(id: string, ownerHandle: string): void {
  db.prepare(`
    UPDATE registrations SET claim_status = 'claimed', owner_handle = ?, claimed_at = CURRENT_TIMESTAMP, claim_token = NULL
    WHERE id = ?
  `).run(ownerHandle, id);
}

export function updateRegistrationLastActive(id: string): void {
  db.prepare('UPDATE registrations SET last_active = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

export function updateRegistrationDescription(id: string, description: string): void {
  db.prepare('UPDATE registrations SET description = ? WHERE id = ?').run(description, id);
}

export function setRegistrationOnline(id: string, roomId: string): void {
  db.prepare('UPDATE registrations SET is_online = 1, current_room_id = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?').run(roomId, id);
}

export function setRegistrationOffline(id: string): void {
  db.prepare('UPDATE registrations SET is_online = 0 WHERE id = ?').run(id);
}

export function setRegistrationRoom(id: string, roomId: string): void {
  db.prepare('UPDATE registrations SET current_room_id = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?').run(roomId, id);
}

export function getOnlineRegistrations(): Registration[] {
  const rows = db.prepare('SELECT * FROM registrations WHERE is_online = 1').all() as any[];
  return rows.map(rowToRegistration);
}

export function offlineStaleRegistrations(timeoutMs: number): number {
  const cutoff = new Date(Date.now() - timeoutMs).toISOString();
  
  // Find stale registrations before marking offline
  const staleRegs = db.prepare(`
    SELECT name FROM registrations
    WHERE is_online = 1 AND (last_active IS NULL OR last_active < ?)
  `).all(cutoff) as { name: string }[];
  
  // Mark registrations offline
  const result = db.prepare(`
    UPDATE registrations SET is_online = 0
    WHERE is_online = 1 AND (last_active IS NULL OR last_active < ?)
  `).run(cutoff);
  
  // Also mark corresponding agents offline
  for (const reg of staleRegs) {
    db.prepare(`
      UPDATE agents 
      SET status = 'offline', current_room_id = NULL, connected_at = NULL
      WHERE name = ?
    `).run(reg.name);
  }
  
  return result.changes;
}

// Load initial rooms from JSON
export function loadInitialRooms(): void {
  const roomsPath = join(__dirname, '..', 'data', 'rooms.json');
  const roomsData = require(roomsPath);
  
  for (const roomData of roomsData) {
    const room: Room = {
      id: roomData.id,
      name: roomData.name,
      description: roomData.description,
      exits: roomData.exits,
      capacity: roomData.capacity,
      createdAt: new Date(),
    };
    upsertRoom(room);
  }
  console.log(`Loaded ${roomsData.length} rooms`);
}

// Initialize rooms on first run
const roomCount = (db.prepare('SELECT COUNT(*) as count FROM rooms').get() as any).count;
if (roomCount === 0) {
  // Read rooms from static-data folder (not affected by volume mount)
  import('fs').then(fs => {
    const roomsPath = join(__dirname, '..', 'static-data', 'rooms.json');
    const roomsData = JSON.parse(fs.readFileSync(roomsPath, 'utf-8'));
    for (const roomData of roomsData as any[]) {
      const room: Room = {
        id: roomData.id,
        name: roomData.name,
        description: roomData.description,
        exits: roomData.exits as Exit[],
        capacity: roomData.capacity,
        createdAt: new Date(),
      };
      upsertRoom(room);
    }
    console.log(`✨ Loaded ${roomsData.length} rooms into database`);
  });
}
