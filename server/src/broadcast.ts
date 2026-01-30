/**
 * Shared broadcast infrastructure for The Playground.
 * Both WebSocket handlers (index.ts) and REST API (rest-api.ts) use these.
 */

import { WebSocket } from 'ws';
import type { Agent, ServerEvent } from './types.js';
import * as rooms from './rooms.js';
import * as agents from './agents.js';
import * as npcs from './npcs.js';

// Shared WebSocket connection tracking
export const botSockets = new Map<string, WebSocket>(); // agentId -> socket
export const spectatorSockets = new Set<WebSocket>();
export const spectatorRooms = new Map<WebSocket, Set<string>>(); // socket -> roomIds
export const spectatorFollows = new Map<WebSocket, string>(); // socket -> agentId

export function send(socket: WebSocket, event: ServerEvent): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}

export function sendError(socket: WebSocket, code: string, message: string): void {
  send(socket, { type: 'error', code, message });
}

export function broadcastToRoom(roomId: string, event: ServerEvent, excludeAgentId?: string): void {
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

export function getRoomState(agent: Agent) {
  const room = rooms.getRoom(agent.currentRoomId!);
  if (!room) throw new Error('Agent not in a valid room');

  const agentsInRoom = rooms.getAgentsInRoom(room.id);
  const npcsInRoom = npcs.getNPCViews(room.id);
  const recentMessages = rooms.getRecentMessages(room.id, 10);

  return {
    type: 'room' as const,
    room: rooms.getRoomView(room),
    agents: [...rooms.getAgentViews(agentsInRoom.filter(a => a.id !== agent.id)), ...npcsInRoom],
    exits: room.exits,
    recent: recentMessages.map(rooms.formatMessageView),
  };
}
