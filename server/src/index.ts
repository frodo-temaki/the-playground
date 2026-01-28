import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { WebSocket, RawData } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { nanoid } from 'nanoid';

import type { 
  Agent, BotCommand, ServerEvent, SpectatorCommand,
  AgentInfo, MessageView 
} from './types.js';
import { ErrorCodes } from './types.js';
import * as db from './db.js';
import * as rooms from './rooms.js';
import * as agents from './agents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Simple auth token (in production, use proper auth)
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'playground-dev-token';

// Track WebSocket connections
const botSockets = new Map<string, WebSocket>(); // agentId -> socket
const spectatorSockets = new Set<WebSocket>();
const spectatorRooms = new Map<WebSocket, Set<string>>(); // socket -> roomIds
const spectatorFollows = new Map<WebSocket, string>(); // socket -> agentId

// Create Fastify server
const app = Fastify({ logger: true });

// Register plugins
await app.register(fastifyCors, { origin: true });
await app.register(fastifyWebsocket);
await app.register(fastifyStatic, {
  root: join(__dirname, '..', 'dashboard'),
  prefix: '/',
});

// === Helper functions ===

function send(socket: WebSocket, event: ServerEvent): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}

function sendError(socket: WebSocket, code: string, message: string): void {
  send(socket, { type: 'error', code, message });
}

function broadcastToRoom(roomId: string, event: ServerEvent, excludeAgentId?: string): void {
  // Send to all bots in the room
  const agentsInRoom = rooms.getAgentsInRoom(roomId);
  for (const agent of agentsInRoom) {
    if (agent.id !== excludeAgentId) {
      const socket = botSockets.get(agent.id);
      if (socket) send(socket, event);
    }
  }
  
  // Send to spectators watching this room
  for (const [socket, watchedRooms] of spectatorRooms) {
    if (watchedRooms.has(roomId) || watchedRooms.has('*')) {
      send(socket, event);
    }
  }
  
  // Send to spectators following agents in this room
  for (const [socket, followedAgentId] of spectatorFollows) {
    const followedAgent = agents.getAgent(followedAgentId);
    if (followedAgent?.currentRoomId === roomId) {
      send(socket, event);
    }
  }
}

function getRoomState(agent: Agent) {
  const room = rooms.getRoom(agent.currentRoomId!);
  if (!room) throw new Error('Agent not in a valid room');
  
  const agentsInRoom = rooms.getAgentsInRoom(room.id);
  const recentMessages = rooms.getRecentMessages(room.id, 10);
  
  return {
    type: 'room' as const,
    room: rooms.getRoomView(room),
    agents: rooms.getAgentViews(agentsInRoom.filter(a => a.id !== agent.id)),
    exits: room.exits,
    recent: recentMessages.map(rooms.formatMessageView),
  };
}

// === Bot WebSocket Handler ===

async function handleBotConnection(socket: WebSocket): Promise<void> {
  let currentAgent: Agent | null = null;
  
  socket.on('message', (data: RawData) => {
    try {
      const command: BotCommand = JSON.parse(data.toString());
      
      // Handle auth first
      if (command.type === 'auth') {
        handleAuth(socket, command.token, command.agent);
        return;
      }
      
      // All other commands require authentication
      if (!currentAgent) {
        sendError(socket, ErrorCodes.AUTH_FAILED, 'Not authenticated');
        return;
      }
      
      switch (command.type) {
        case 'look':
          send(socket, getRoomState(currentAgent));
          break;
          
        case 'say':
          handleSay(currentAgent, command.content);
          break;
          
        case 'emote':
          handleEmote(currentAgent, command.content);
          break;
          
        case 'whisper':
          handleWhisper(socket, currentAgent, command.target, command.content);
          break;
          
        case 'go':
          handleGo(socket, currentAgent, command.direction, command.room);
          break;
          
        case 'exits':
          handleExits(socket, currentAgent);
          break;
          
        case 'who':
          handleWho(socket, currentAgent);
          break;
          
        case 'rooms':
          send(socket, { type: 'rooms', rooms: rooms.getRoomSummaries() });
          break;
          
        case 'agents':
          send(socket, { 
            type: 'agents', 
            agents: agents.getOnlineAgents().map(agents.getAgentView) 
          });
          break;
          
        case 'disconnect':
          socket.close();
          break;
          
        default:
          sendError(socket, ErrorCodes.INVALID_MESSAGE, 'Unknown command type');
      }
    } catch (err) {
      app.log.error(err, 'Error handling bot message');
      sendError(socket, ErrorCodes.INVALID_MESSAGE, 'Invalid message format');
    }
  });
  
  socket.on('close', () => {
    if (currentAgent) {
      handleDisconnect(currentAgent);
    }
  });
  
  function handleAuth(socket: WebSocket, token: string, info: AgentInfo): void {
    // Simple token auth (enhance for production)
    if (token !== AUTH_TOKEN) {
      sendError(socket, ErrorCodes.AUTH_FAILED, 'Invalid token');
      socket.close();
      return;
    }
    
    // Check if agent name is already connected
    const existing = agents.getAgentByName(info.name);
    if (existing && agents.isAgentConnected(existing.id)) {
      sendError(socket, ErrorCodes.ALREADY_CONNECTED, `Agent "${info.name}" is already connected`);
      socket.close();
      return;
    }
    
    // Create or update agent
    const agent = agents.createOrUpdateAgent(info);
    
    // Set agent online in spawn room
    const spawnRoom = rooms.getSpawnRoom();
    agents.setAgentOnline(agent, spawnRoom.id);
    currentAgent = agent;
    
    // Register socket
    botSockets.set(agent.id, socket);
    
    // Send connected event
    send(socket, {
      type: 'connected',
      agent,
      room: rooms.getRoomView(spawnRoom),
    });
    
    // Announce arrival to room
    const arriveMessage = rooms.addMessage(spawnRoom.id, 'arrive', `${agent.name} appears.`, agent);
    broadcastToRoom(spawnRoom.id, {
      type: 'arrive',
      agent: agents.getAgentView(agent),
    }, agent.id);
    
    app.log.info(`🤖 ${agent.name} connected to ${spawnRoom.name}`);
  }
  
  function handleSay(agent: Agent, content: string): void {
    if (!agent.currentRoomId) return;
    
    const message = rooms.addMessage(agent.currentRoomId, 'say', content, agent);
    broadcastToRoom(agent.currentRoomId, {
      type: 'message',
      message: rooms.formatMessageView(message),
    });
  }
  
  function handleEmote(agent: Agent, content: string): void {
    if (!agent.currentRoomId) return;
    
    const message = rooms.addMessage(agent.currentRoomId, 'emote', content, agent);
    broadcastToRoom(agent.currentRoomId, {
      type: 'message',
      message: rooms.formatMessageView(message),
    });
  }
  
  function handleWhisper(socket: WebSocket, agent: Agent, target: string, content: string): void {
    const targetAgent = agents.findAgentByNameOrId(target);
    if (!targetAgent || !agents.isAgentConnected(targetAgent.id)) {
      sendError(socket, ErrorCodes.AGENT_NOT_FOUND, `Agent "${target}" not found or offline`);
      return;
    }
    
    const message = rooms.addMessage(
      agent.currentRoomId!, 
      'whisper', 
      content, 
      agent, 
      targetAgent.id
    );
    
    const messageView = rooms.formatMessageView(message);
    
    // Send to sender
    send(socket, { type: 'message', message: messageView });
    
    // Send to target
    const targetSocket = botSockets.get(targetAgent.id);
    if (targetSocket) {
      send(targetSocket, { type: 'message', message: messageView });
    }
  }
  
  function handleGo(socket: WebSocket, agent: Agent, direction?: string, roomId?: string): void {
    if (!agent.currentRoomId) return;
    
    const currentRoom = rooms.getRoom(agent.currentRoomId);
    if (!currentRoom) return;
    
    let targetRoom: ReturnType<typeof rooms.getRoom>;
    let exitDirection: string | undefined;
    
    if (direction) {
      // Find exit by direction
      const exit = rooms.findExit(currentRoom, direction);
      if (!exit) {
        sendError(socket, ErrorCodes.EXIT_NOT_FOUND, `No exit in direction "${direction}"`);
        return;
      }
      targetRoom = rooms.getRoom(exit.targetRoomId);
      exitDirection = exit.direction;
    } else if (roomId) {
      // Find room directly
      targetRoom = rooms.findRoomByIdOrName(roomId);
      if (!targetRoom) {
        sendError(socket, ErrorCodes.ROOM_NOT_FOUND, `Room "${roomId}" not found`);
        return;
      }
    } else {
      sendError(socket, ErrorCodes.INVALID_MESSAGE, 'Must specify direction or room');
      return;
    }
    
    if (!targetRoom) {
      sendError(socket, ErrorCodes.ROOM_NOT_FOUND, 'Target room not found');
      return;
    }
    
    // Announce departure
    const leaveMessage = rooms.addMessage(
      currentRoom.id, 
      'leave', 
      `${agent.name} leaves${exitDirection ? ` ${exitDirection}` : ''}.`, 
      agent
    );
    broadcastToRoom(currentRoom.id, {
      type: 'leave',
      agent: agents.getAgentView(agent),
      direction: exitDirection,
    }, agent.id);
    
    // Move agent
    agents.moveAgent(agent, targetRoom.id);
    
    // Announce arrival
    const arriveMessage = rooms.addMessage(targetRoom.id, 'arrive', `${agent.name} arrives.`, agent);
    broadcastToRoom(targetRoom.id, {
      type: 'arrive',
      agent: agents.getAgentView(agent),
    }, agent.id);
    
    // Send new room state to agent
    send(socket, getRoomState(agent));
    
    app.log.info(`🚶 ${agent.name} moved from ${currentRoom.name} to ${targetRoom.name}`);
  }
  
  function handleExits(socket: WebSocket, agent: Agent): void {
    if (!agent.currentRoomId) return;
    
    const room = rooms.getRoom(agent.currentRoomId);
    if (!room) return;
    
    send(socket, { type: 'exits', exits: room.exits });
  }
  
  function handleWho(socket: WebSocket, agent: Agent): void {
    if (!agent.currentRoomId) return;
    
    const agentsInRoom = rooms.getAgentsInRoom(agent.currentRoomId);
    send(socket, { 
      type: 'who', 
      agents: rooms.getAgentViews(agentsInRoom) 
    });
  }
  
  function handleDisconnect(agent: Agent): void {
    if (agent.currentRoomId) {
      // Announce departure
      const message = rooms.addMessage(
        agent.currentRoomId, 
        'leave', 
        `${agent.name} fades away.`, 
        agent
      );
      broadcastToRoom(agent.currentRoomId, {
        type: 'leave',
        agent: agents.getAgentView(agent),
      }, agent.id);
    }
    
    // Set offline
    agents.setAgentOffline(agent);
    botSockets.delete(agent.id);
    
    app.log.info(`👋 ${agent.name} disconnected`);
  }
}

// === Spectator WebSocket Handler ===

async function handleSpectatorConnection(socket: WebSocket): Promise<void> {
  spectatorSockets.add(socket);
  spectatorRooms.set(socket, new Set());
  
  socket.on('message', (data: RawData) => {
    try {
      const command: SpectatorCommand = JSON.parse(data.toString());
      
      switch (command.type) {
        case 'watch':
          spectatorRooms.get(socket)?.add(command.roomId);
          break;
          
        case 'unwatch':
          spectatorRooms.get(socket)?.delete(command.roomId);
          break;
          
        case 'watchAll':
          spectatorRooms.get(socket)?.add('*');
          break;
          
        case 'follow':
          spectatorFollows.set(socket, command.agentId);
          break;
          
        case 'unfollow':
          spectatorFollows.delete(socket);
          break;
      }
    } catch (err) {
      app.log.error(err, 'Error handling spectator message');
    }
  });
  
  socket.on('close', () => {
    spectatorSockets.delete(socket);
    spectatorRooms.delete(socket);
    spectatorFollows.delete(socket);
  });
}

// === HTTP Routes ===

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// API: List rooms
app.get('/api/rooms', async () => {
  return { rooms: rooms.getRoomSummaries() };
});

// API: Get room details
app.get<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
  const room = rooms.getRoom(request.params.id);
  if (!room) {
    return reply.code(404).send({ error: 'Room not found' });
  }
  
  const agentsInRoom = rooms.getAgentsInRoom(room.id);
  const recentMessages = rooms.getRecentMessages(room.id, 50);
  
  return {
    room: rooms.getRoomView(room),
    agents: rooms.getAgentViews(agentsInRoom),
    exits: room.exits,
    recentMessages: recentMessages.map(rooms.formatMessageView),
  };
});

// API: List agents
app.get('/api/agents', async () => {
  const allAgents = agents.getAllAgents();
  return {
    agents: allAgents.map(a => ({
      ...agents.getAgentView(a),
      status: a.status,
      currentRoom: a.currentRoomId ? rooms.getRoom(a.currentRoomId)?.name : null,
    })),
  };
});

// API: Get agent details
app.get<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
  const agent = agents.getAgent(request.params.id);
  if (!agent) {
    return reply.code(404).send({ error: 'Agent not found' });
  }
  
  return {
    agent: {
      ...agents.getAgentView(agent),
      status: agent.status,
      currentRoom: agent.currentRoomId 
        ? rooms.getRoomView(rooms.getRoom(agent.currentRoomId)!)
        : null,
    },
  };
});

// === WebSocket Routes ===

// Bot WebSocket endpoint
app.get('/bot', { websocket: true }, (socket, request) => {
  handleBotConnection(socket);
});

// Spectator WebSocket endpoint  
app.get('/spectate', { websocket: true }, (socket, request) => {
  handleSpectatorConnection(socket);
});

// === Start Server ===

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`
🎪 The Playground is open!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🌐 Dashboard:  http://localhost:${PORT}
  🤖 Bot API:    ws://localhost:${PORT}/bot
  👁️  Spectate:   ws://localhost:${PORT}/spectate
  📡 REST API:   http://localhost:${PORT}/api
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Auth Token: ${AUTH_TOKEN}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
