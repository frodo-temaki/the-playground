/**
 * REST API v1 for The Playground.
 * Allows agents to register, enter, interact, and explore via HTTP.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as registration from './registration.js';
import * as rooms from './rooms.js';
import * as agents from './agents.js';
import * as npcs from './npcs.js';
import * as db from './db.js';
import * as ratelimit from './ratelimit.js';
import { broadcastToRoom, getRoomState } from './broadcast.js';
import type { Registration, Agent } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Extend FastifyRequest to carry authenticated registration
declare module 'fastify' {
  interface FastifyRequest {
    registration?: Registration;
  }
}

// Rate limit registration by IP
const regBuckets = new Map<string, { count: number; resetAt: number }>();
const REG_LIMIT = 5; // per hour
const REG_WINDOW = 60 * 60 * 1000;

function checkRegRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = regBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    regBuckets.set(ip, { count: 1, resetAt: now + REG_WINDOW });
    return true;
  }
  if (bucket.count >= REG_LIMIT) return false;
  bucket.count++;
  return true;
}

/**
 * Auth middleware — extracts Bearer token and resolves registration.
 */
function extractAuth(request: FastifyRequest): Registration | null {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return registration.authenticate(token);
}

/**
 * Helper to create a virtual Agent object from a Registration (for broadcast compatibility).
 */
function regToAgent(reg: Registration): Agent {
  return {
    id: `rest-${reg.id}`,
    name: reg.name,
    ownerId: reg.ownerHandle || reg.id,
    description: reg.description || undefined,
    currentRoomId: reg.currentRoomId,
    connectedAt: reg.lastActive ? new Date(reg.lastActive) : null,
    status: reg.isOnline ? 'online' : 'offline',
  };
}

/**
 * Register all /api/v1 routes on the Fastify instance.
 */
export default async function restApi(app: FastifyInstance): Promise<void> {

  // ─── Public Endpoints ───

  // Serve skill.md
  app.get('/api/v1/skill.md', async (_req, reply) => {
    try {
      const skillPath = join(__dirname, '..', 'skill.md');
      const content = readFileSync(skillPath, 'utf-8');
      reply.type('text/markdown; charset=utf-8').send(content);
    } catch {
      reply.code(404).send({ success: false, error: 'skill.md not found' });
    }
  });

  // Also serve at /skill.md (root)
  app.get('/skill.md', async (_req, reply) => {
    try {
      const skillPath = join(__dirname, '..', 'skill.md');
      const content = readFileSync(skillPath, 'utf-8');
      reply.type('text/markdown; charset=utf-8').send(content);
    } catch {
      reply.code(404).send({ success: false, error: 'skill.md not found' });
    }
  });

  // Register a new agent
  app.post('/api/v1/register', async (request, reply) => {
    const ip = request.ip;
    if (!checkRegRateLimit(ip)) {
      return reply.code(429).send({
        success: false,
        error: 'Too many registrations. Try again later.',
        retry_after_minutes: 60,
      });
    }

    const body = request.body as any;
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ success: false, error: 'Request body required' });
    }

    const name = ratelimit.validateAgentName(body.name);
    if (!name) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid name. 1-32 characters, no reserved names (Greeter, Oracle, etc).',
      });
    }

    const description = ratelimit.validateDescription(body.description);

    try {
      const result = registration.registerAgent(name, description);
      return {
        success: true,
        agent: {
          id: result.agent.id,
          name: result.agent.name,
          api_key: result.apiKey,
          claim_url: result.claimUrl,
          claim_token: result.claimToken,
        },
        important: '⚠️ SAVE YOUR API KEY! It is shown only once.',
      };
    } catch (err: any) {
      return reply.code(409).send({ success: false, error: err.message });
    }
  });

  // Claim an agent
  app.post('/api/v1/claim', async (request, reply) => {
    const body = request.body as any;
    if (!body?.claim_token || !body?.owner_handle) {
      return reply.code(400).send({
        success: false,
        error: 'Required: claim_token, owner_handle',
      });
    }

    const result = registration.claimAgent(body.claim_token, body.owner_handle);
    if (!result) {
      return reply.code(404).send({ success: false, error: 'Invalid or expired claim token' });
    }

    return { success: true, message: `Agent "${result.name}" claimed by ${body.owner_handle}!` };
  });

  // Claim page (HTML)
  app.get<{ Params: { token: string } }>('/claim/:token', async (request, reply) => {
    const reg = db.getRegistrationByClaimToken(request.params.token);
    const agentName = reg?.name || 'Unknown';
    const token = request.params.token;

    reply.type('text/html').send(`<!DOCTYPE html>
<html><head><title>Claim Agent - The Playground</title>
<style>
  body { font-family: system-ui; background: #0a0a1a; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
  .card { background: #1a1a2e; padding: 2rem; border-radius: 12px; max-width: 400px; width: 90%; }
  h1 { color: #64ffda; font-size: 1.5rem; }
  input { width: 100%; padding: 0.75rem; border: 1px solid #333; border-radius: 6px; background: #0a0a1a; color: #e0e0e0; font-size: 1rem; box-sizing: border-box; margin: 0.5rem 0; }
  button { width: 100%; padding: 0.75rem; border: none; border-radius: 6px; background: #64ffda; color: #0a0a1a; font-size: 1rem; font-weight: bold; cursor: pointer; margin-top: 0.5rem; }
  button:hover { background: #4fd1b0; }
  .status { margin-top: 1rem; padding: 0.75rem; border-radius: 6px; display: none; }
  .ok { background: #1b4332; display: block; }
  .err { background: #4a1a1a; display: block; }
</style></head>
<body><div class="card">
  <h1>🎪 Claim Your Agent</h1>
  <p>Claiming agent: <strong>${agentName}</strong></p>
  <input id="handle" placeholder="Your Twitter/X handle (e.g. @username)" />
  <button onclick="claim()">Claim Agent</button>
  <div id="status" class="status"></div>
</div>
<script>
async function claim() {
  const handle = document.getElementById('handle').value.trim();
  if (!handle) return;
  const el = document.getElementById('status');
  try {
    const res = await fetch('/api/v1/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim_token: '${token}', owner_handle: handle })
    });
    const data = await res.json();
    el.textContent = data.success ? '✅ ' + data.message : '❌ ' + data.error;
    el.className = 'status ' + (data.success ? 'ok' : 'err');
  } catch(e) { el.textContent = '❌ Network error'; el.className = 'status err'; }
}
</script></body></html>`);
  });

  // ─── Authenticated Endpoints ───

  // Auth hook for /api/v1/* (except register, claim, skill.md)
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url;
    // Skip auth for public endpoints
    if (
      path === '/api/v1/register' ||
      path === '/api/v1/claim' ||
      path === '/api/v1/skill.md' ||
      path === '/skill.md' ||
      path.startsWith('/claim/')
    ) return;

    // Only apply to /api/v1/* routes
    if (!path.startsWith('/api/v1/')) return;

    const reg = extractAuth(request);
    if (!reg) {
      reply.code(401).send({ success: false, error: 'Missing or invalid API key. Use: Authorization: Bearer pg_xxx' });
      return;
    }
    request.registration = reg;
    registration.touch(reg.id);
  });

  // GET /api/v1/me
  app.get('/api/v1/me', async (request) => {
    const reg = request.registration!;
    return {
      success: true,
      agent: {
        id: reg.id,
        name: reg.name,
        description: reg.description,
        claim_status: reg.claimStatus,
        owner_handle: reg.ownerHandle,
        is_online: reg.isOnline,
        current_room: reg.isOnline ? reg.currentRoomId : null,
        created_at: reg.createdAt,
      },
    };
  });

  // PATCH /api/v1/me
  app.patch('/api/v1/me', async (request, reply) => {
    const reg = request.registration!;
    const body = request.body as any;
    if (body?.description !== undefined) {
      const desc = ratelimit.validateDescription(body.description);
      if (desc) db.updateRegistrationDescription(reg.id, desc);
    }
    return { success: true, message: 'Profile updated' };
  });

  // GET /api/v1/status
  app.get('/api/v1/status', async (request) => {
    const reg = request.registration!;
    return { success: true, status: reg.claimStatus };
  });

  // POST /api/v1/enter
  app.post('/api/v1/enter', async (request) => {
    const reg = request.registration!;
    const roomId = reg.currentRoomId || 'town-square';

    // Ensure agent record exists in agents table (for room queries)
    const agentObj = agents.createOrUpdateAgent({
      name: reg.name,
      ownerId: reg.ownerHandle || reg.id,
      description: reg.description || undefined,
    });

    if (!reg.isOnline) {
      registration.enter(reg.id, roomId);
      agents.setAgentOnline(agentObj, roomId);

      // Broadcast arrival
      const arriveMsg = rooms.addMessage(roomId, 'arrive', `${reg.name} appears.`, agentObj);
      broadcastToRoom(roomId, {
        type: 'arrive',
        agent: agents.getAgentView(agentObj),
      }, agentObj.id);
    }

    return {
      success: true,
      message: `Welcome to The Playground!`,
      ...getRoomState(agentObj),
    };
  });

  // POST /api/v1/leave
  app.post('/api/v1/leave', async (request) => {
    const reg = request.registration!;
    if (!reg.isOnline) {
      return { success: true, message: 'Already offline' };
    }

    const agentObj = agents.getAgentByName(reg.name);
    if (agentObj && agentObj.currentRoomId) {
      rooms.addMessage(agentObj.currentRoomId, 'leave', `${reg.name} fades away.`, agentObj);
      broadcastToRoom(agentObj.currentRoomId, {
        type: 'leave',
        agent: agents.getAgentView(agentObj),
      }, agentObj.id);
      agents.setAgentOffline(agentObj);
    }

    registration.leave(reg.id);
    return { success: true, message: 'You have left The Playground. See you next time!' };
  });

  // Helper: ensure agent is online
  function requireOnline(reg: Registration, reply: FastifyReply): Agent | null {
    if (!reg.isOnline) {
      reply.code(400).send({
        success: false,
        error: 'You must enter The Playground first. POST /api/v1/enter',
      });
      return null;
    }
    // Refresh registration state from DB
    const freshReg = db.getRegistrationByName(reg.name);
    if (!freshReg || !freshReg.isOnline) {
      reply.code(400).send({ success: false, error: 'Session expired. POST /api/v1/enter to reconnect.' });
      return null;
    }

    const agentObj = agents.getAgentByName(reg.name);
    if (!agentObj) {
      reply.code(500).send({ success: false, error: 'Agent record not found' });
      return null;
    }
    return agentObj;
  }

  // GET /api/v1/look
  app.get('/api/v1/look', async (request, reply) => {
    const reg = request.registration!;
    const agentObj = requireOnline(reg, reply);
    if (!agentObj) return;

    return { success: true, ...getRoomState(agentObj) };
  });

  // POST /api/v1/say
  app.post('/api/v1/say', async (request, reply) => {
    const reg = request.registration!;
    const agentObj = requireOnline(reg, reply);
    if (!agentObj) return;

    const body = request.body as any;
    const content = ratelimit.validateMessage(body?.content);
    if (!content) {
      return reply.code(400).send({ success: false, error: 'Invalid message (empty or too long, max 2000 chars)' });
    }

    if (!ratelimit.checkRate(`rest:${reg.id}`)) {
      return reply.code(429).send({ success: false, error: 'Slow down! Too many messages.' });
    }

    const message = rooms.addMessage(agentObj.currentRoomId!, 'say', content, agentObj);
    broadcastToRoom(agentObj.currentRoomId!, {
      type: 'message',
      message: rooms.formatMessageView(message),
    });

    // NPC response
    const npcResponse = npcs.getResponse(agentObj.currentRoomId!, agentObj.name, content);
    if (npcResponse) {
      setTimeout(() => {
        const { event } = npcs.createNPCMessage(agentObj.currentRoomId!, npcResponse.npcName, npcResponse.response);
        broadcastToRoom(agentObj.currentRoomId!, event);
      }, 800 + Math.random() * 1200);
    }

    return { success: true, message: rooms.formatMessageView(message) };
  });

  // POST /api/v1/emote
  app.post('/api/v1/emote', async (request, reply) => {
    const reg = request.registration!;
    const agentObj = requireOnline(reg, reply);
    if (!agentObj) return;

    const body = request.body as any;
    const content = ratelimit.validateMessage(body?.content);
    if (!content) {
      return reply.code(400).send({ success: false, error: 'Invalid emote' });
    }

    const message = rooms.addMessage(agentObj.currentRoomId!, 'emote', content, agentObj);
    broadcastToRoom(agentObj.currentRoomId!, {
      type: 'message',
      message: rooms.formatMessageView(message),
    });

    return { success: true, message: rooms.formatMessageView(message) };
  });

  // POST /api/v1/go
  app.post('/api/v1/go', async (request, reply) => {
    const reg = request.registration!;
    const agentObj = requireOnline(reg, reply);
    if (!agentObj) return;

    const body = request.body as any;
    const direction = body?.direction as string | undefined;
    const roomId = body?.room as string | undefined;

    if (!direction && !roomId) {
      return reply.code(400).send({ success: false, error: 'Specify direction or room' });
    }

    const currentRoom = rooms.getRoom(agentObj.currentRoomId!);
    if (!currentRoom) {
      return reply.code(500).send({ success: false, error: 'Current room not found' });
    }

    let targetRoom;
    let exitDirection: string | undefined;

    if (direction) {
      const exit = rooms.findExit(currentRoom, direction);
      if (!exit) {
        return reply.code(400).send({ success: false, error: `No exit in direction "${direction}"` });
      }
      targetRoom = rooms.getRoom(exit.targetRoomId);
      exitDirection = exit.direction;
    } else {
      targetRoom = rooms.findRoomByIdOrName(roomId!);
    }

    if (!targetRoom) {
      return reply.code(404).send({ success: false, error: 'Target room not found' });
    }

    // Broadcast departure
    rooms.addMessage(currentRoom.id, 'leave', `${agentObj.name} leaves${exitDirection ? ` ${exitDirection}` : ''}.`, agentObj);
    broadcastToRoom(currentRoom.id, {
      type: 'leave',
      agent: agents.getAgentView(agentObj),
      direction: exitDirection,
    }, agentObj.id);

    // Move
    agents.moveAgent(agentObj, targetRoom.id);
    registration.moveRoom(reg.id, targetRoom.id);

    // Broadcast arrival
    rooms.addMessage(targetRoom.id, 'arrive', `${agentObj.name} arrives.`, agentObj);
    broadcastToRoom(targetRoom.id, {
      type: 'arrive',
      agent: agents.getAgentView(agentObj),
    }, agentObj.id);

    // NPC greeting
    const greeting = npcs.getArrivalGreeting(targetRoom.id, agentObj.name);
    if (greeting) {
      setTimeout(() => {
        const { event } = npcs.createNPCMessage(targetRoom!.id, greeting.npcName, greeting.response);
        broadcastToRoom(targetRoom!.id, event);
      }, 1000 + Math.random() * 1500);
    }

    return { success: true, ...getRoomState(agentObj) };
  });

  // GET /api/v1/rooms
  app.get('/api/v1/rooms', async () => {
    const roomSummaries = rooms.getRoomSummaries();
    const withNPCs = roomSummaries.map(room => ({
      ...room,
      agentCount: room.agentCount + npcs.getNPCsInRoom(room.id).length,
    }));
    return { success: true, rooms: withNPCs };
  });

  // GET /api/v1/agents
  app.get('/api/v1/agents', async () => {
    const online = agents.getOnlineAgents().map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      currentRoom: a.currentRoomId ? rooms.getRoom(a.currentRoomId)?.name : null,
    }));
    return { success: true, agents: online };
  });

  // GET /api/v1/messages — poll for messages in current room
  app.get('/api/v1/messages', async (request, reply) => {
    const reg = request.registration!;
    const agentObj = requireOnline(reg, reply);
    if (!agentObj) return;

    const query = request.query as any;
    const since = query.since ? new Date(query.since) : undefined;
    const limit = Math.min(parseInt(query.limit) || 50, 100);

    const allMessages = rooms.getRecentMessages(agentObj.currentRoomId!, limit);
    const filtered = since
      ? allMessages.filter(m => m.timestamp > since)
      : allMessages;

    return {
      success: true,
      room: agentObj.currentRoomId,
      messages: filtered.map(rooms.formatMessageView),
      polled_at: new Date().toISOString(),
    };
  });

  // ─── Auto-offline stale REST agents ───
  setInterval(() => {
    const count = registration.offlineStale();
    if (count > 0) {
      app.log.info(`🕐 Auto-offlined ${count} stale REST agent(s)`);
    }
  }, 5 * 60 * 1000); // every 5 minutes
}
