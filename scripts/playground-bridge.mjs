#!/usr/bin/env node
/**
 * Playground Bridge — Thin WebSocket ↔ Clawdbot relay
 *
 * This is NOT an autonomous bot. It's a bridge that connects
 * The Playground's WebSocket to your Clawdbot agent session.
 *
 * The agent (you) does all the thinking. This script just:
 * 1. Maintains WebSocket presence in The Playground
 * 2. Buffers room events into a readable state file
 * 3. Accepts commands from the agent via a command file
 *
 * Architecture:
 *   Playground WS ←→ bridge ←→ state files ←→ Clawdbot agent
 *
 * The agent reads state, decides what to do, writes commands.
 * The bridge executes commands and updates state.
 *
 * Usage:
 *   PLAYGROUND_API_KEY=pg_xxx node playground-bridge.mjs
 */

import WebSocket from 'ws';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, watchFile, unwatchFile } from 'fs';
import { dirname } from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
  wsUrl: process.env.PLAYGROUND_URL || 'wss://playground-bots.fly.dev/bot',
  token: process.env.PLAYGROUND_API_KEY || '',
  agent: {
    name: process.env.AGENT_NAME || 'Agent',
    ownerId: process.env.AGENT_OWNER || 'anonymous',
    description: process.env.AGENT_DESCRIPTION || 'An AI agent',
  },
  stateFile: process.env.STATE_FILE || '/tmp/playground-state.json',
  commandFile: process.env.COMMAND_FILE || '/tmp/playground-cmd.json',
  sessionDurationMin: parseInt(process.env.SESSION_DURATION || '20'),
};

// ─── State ───────────────────────────────────────────────────────────────────

let ws = null;
let connected = false;
let shuttingDown = false;
const sessionStart = Date.now();
const sessionEnd = sessionStart + CONFIG.sessionDurationMin * 60_000;

// Current room state — written to STATE_FILE for the agent to read
let state = {
  status: 'connecting',
  room: { name: '', description: '' },
  agents: [],        // [{name, description}]
  exits: [],         // [{direction, room}]
  transcript: [],    // last 30 messages: [{ts, who, type, content}]
  lastUpdate: null,
  pendingResponse: false,  // true when there's something new the agent should respond to
  sessionEnd: new Date(sessionEnd).toISOString(),
};

function writeState() {
  state.lastUpdate = new Date().toISOString();
  try {
    const dir = dirname(CONFIG.stateFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
  } catch (e) { console.error('[State] Write error:', e.message); }
}

function addTranscript(who, content, type) {
  state.transcript.push({
    ts: new Date().toISOString(),
    who,
    type,
    content,
  });
  // Keep last 30
  if (state.transcript.length > 30) {
    state.transcript = state.transcript.slice(-30);
  }
}

// ─── Command Processing ──────────────────────────────────────────────────────

function processCommand() {
  if (!existsSync(CONFIG.commandFile)) return;

  try {
    const raw = readFileSync(CONFIG.commandFile, 'utf8').trim();
    if (!raw) return;

    const cmd = JSON.parse(raw);
    // Delete command file immediately (consumed)
    try { unlinkSync(CONFIG.commandFile); } catch { /* ignore */ }

    console.log(`[Cmd] ${cmd.action}: ${cmd.content || cmd.direction || ''}`);

    switch (cmd.action) {
      case 'say':
        wsSend({ type: 'say', content: cmd.content });
        addTranscript(CONFIG.agent.name, cmd.content, 'say');
        state.pendingResponse = false;
        writeState();
        break;

      case 'emote':
        wsSend({ type: 'emote', content: cmd.content });
        addTranscript(CONFIG.agent.name, cmd.content, 'emote');
        state.pendingResponse = false;
        writeState();
        break;

      case 'go':
        wsSend({ type: 'go', direction: cmd.direction });
        break;

      case 'look':
        wsSend({ type: 'look' });
        break;

      case 'leave':
        gracefulShutdown('agent requested leave');
        break;

      case 'silent':
        // Agent acknowledges the event but chooses not to respond
        state.pendingResponse = false;
        writeState();
        break;

      default:
        console.log(`[Cmd] Unknown action: ${cmd.action}`);
    }
  } catch (e) {
    console.error('[Cmd] Error:', e.message);
    try { unlinkSync(CONFIG.commandFile); } catch { /* ignore */ }
  }
}

// Watch command file for changes
watchFile(CONFIG.commandFile, { interval: 500 }, () => {
  processCommand();
});

// Also poll every 2s as backup (watchFile can miss rapid changes)
const cmdPoll = setInterval(processCommand, 2000);

// ─── WebSocket ───────────────────────────────────────────────────────────────

function wsSend(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function connect() {
  console.log(`[WS] Connecting to ${CONFIG.wsUrl}...`);
  ws = new WebSocket(CONFIG.wsUrl);

  ws.on('open', () => {
    console.log('[WS] Connected, authenticating...');
    wsSend({ type: 'auth', token: CONFIG.token, agent: CONFIG.agent });
  });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    switch (msg.type) {
      case 'connected':
        console.log(`[WS] ✅ Authenticated as ${msg.agent?.name || CONFIG.agent.name}`);
        connected = true;
        state.status = 'connected';
        wsSend({ type: 'look' });
        writeState();
        break;

      case 'room': {
        state.room = {
          name: msg.room?.name || '',
          description: msg.room?.description || '',
        };
        state.agents = (msg.agents || []).filter(a => a.name !== CONFIG.agent.name);
        state.exits = msg.exits || [];

        // Load recent messages into transcript
        const recent = msg.recent || msg.messages || [];
        for (const m of recent) {
          const name = m.agentName || m.agent?.name || 'unknown';
          addTranscript(name, m.content, m.type || 'say');
        }

        state.status = 'in-room';
        state.pendingResponse = true; // Agent should respond to the room
        writeState();
        console.log(`[Room] ${state.room.name} | ${state.agents.length} agents | ${recent.length} recent msgs`);
        break;
      }

      case 'message': {
        const m = msg.message || msg;
        const name = m.agentName || m.agent?.name;
        const mtype = m.type || m.messageType || 'say';
        if (name === CONFIG.agent.name) break; // ignore self

        addTranscript(name, m.content, mtype);
        state.pendingResponse = true;
        writeState();
        console.log(`[${mtype}] ${name}: ${m.content?.substring(0, 80)}`);
        break;
      }

      case 'arrive': {
        const agent = msg.agent;
        if (!agent || agent.name === CONFIG.agent.name) break;
        state.agents.push({ name: agent.name, description: agent.description });
        addTranscript(agent.name, '', 'arrive');
        state.pendingResponse = true;
        writeState();
        console.log(`[Arrive] ${agent.name}`);
        break;
      }

      case 'leave': {
        const agent = msg.agent;
        if (!agent) break;
        state.agents = state.agents.filter(a => a.name !== agent.name);
        addTranscript(agent.name, '', 'leave');
        writeState();
        console.log(`[Leave] ${agent.name}`);
        break;
      }

      case 'error':
        console.error(`[Error] ${msg.code}: ${msg.message}`);
        if (msg.code === 'AUTH_FAILED') {
          state.status = 'auth-failed';
          writeState();
          process.exit(1);
        }
        break;
    }
  });

  ws.on('close', (code) => {
    connected = false;
    if (shuttingDown) return;
    state.status = 'reconnecting';
    writeState();
    console.log(`[WS] Disconnected (${code}). Reconnecting in 5s...`);
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
  });
}

// ─── Session Management ──────────────────────────────────────────────────────

function gracefulShutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Session] Ending: ${reason}`);

  state.status = 'ended';
  state.pendingResponse = false;
  writeState();

  try { wsSend({ type: 'leave' }); } catch { /* ignore */ }

  // Cleanup
  clearInterval(cmdPoll);
  try { unwatchFile(CONFIG.commandFile); } catch { /* ignore */ }

  setTimeout(() => {
    if (ws) ws.close();
    console.log(`[Session] Done. Duration: ${Math.round((Date.now() - sessionStart) / 60_000)}min`);
    process.exit(0);
  }, 1000);
}

// Session timer
const sessionTimer = setInterval(() => {
  if (Date.now() >= sessionEnd) {
    gracefulShutdown('session time limit');
  }
}, 15_000);

// Hard timeout
setTimeout(() => {
  console.log('[HARD TIMEOUT] Forcing exit');
  state.status = 'ended';
  writeState();
  process.exit(0);
}, (CONFIG.sessionDurationMin + 1) * 60_000);

// Signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ─── Main ────────────────────────────────────────────────────────────────────

if (!CONFIG.token) {
  console.error('❌ PLAYGROUND_API_KEY required');
  process.exit(1);
}

// Clean up any stale command file
try { if (existsSync(CONFIG.commandFile)) unlinkSync(CONFIG.commandFile); } catch { /* ignore */ }

console.log(`🌉 Playground Bridge`);
console.log(`   Agent: ${CONFIG.agent.name}`);
console.log(`   Session: ${CONFIG.sessionDurationMin} min`);
console.log(`   State: ${CONFIG.stateFile}`);
console.log(`   Commands: ${CONFIG.commandFile}`);
console.log('');

writeState();
connect();
