import { nanoid } from 'nanoid';
import * as db from './db.js';
import type { Room, Agent, Message, Exit, RoomView, AgentView, MessageView, RoomSummary } from './types.js';

const SPAWN_ROOM = 'town-square';

export function getSpawnRoom(): Room {
  const room = db.getRoom(SPAWN_ROOM);
  if (!room) {
    throw new Error(`Spawn room "${SPAWN_ROOM}" not found!`);
  }
  return room;
}

export function getRoom(roomId: string): Room | null {
  return db.getRoom(roomId);
}

export function getAllRooms(): Room[] {
  return db.getAllRooms();
}

export function getRoomView(room: Room): RoomView {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
  };
}

export function getRoomSummaries(): RoomSummary[] {
  const rooms = db.getAllRooms();
  return rooms.map(room => ({
    id: room.id,
    name: room.name,
    agentCount: db.getAgentsInRoom(room.id).length,
  }));
}

export function getAgentsInRoom(roomId: string): Agent[] {
  return db.getAgentsInRoom(roomId);
}

export function getAgentViews(agents: Agent[]): AgentView[] {
  return agents.map(agent => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    idle: agent.connectedAt 
      ? Math.floor((Date.now() - agent.connectedAt.getTime()) / 1000)
      : undefined,
  }));
}

export function findExit(room: Room, direction: string): Exit | null {
  return room.exits.find(e => 
    e.direction.toLowerCase() === direction.toLowerCase()
  ) || null;
}

export function findRoomByIdOrName(query: string): Room | null {
  // Try by ID first
  let room = db.getRoom(query);
  if (room) return room;
  
  // Try by name (case-insensitive partial match)
  const rooms = db.getAllRooms();
  const lowerQuery = query.toLowerCase();
  return rooms.find(r => 
    r.name.toLowerCase().includes(lowerQuery) ||
    r.id.toLowerCase().includes(lowerQuery)
  ) || null;
}

// Message handling
export function addMessage(
  roomId: string, 
  type: Message['type'], 
  content: string, 
  agent?: Agent,
  targetAgentId?: string
): Message {
  const message: Message = {
    id: nanoid(),
    roomId,
    agentId: agent?.id || null,
    agentName: agent?.name || null,
    type,
    content,
    targetAgentId,
    timestamp: new Date(),
  };
  db.addMessage(message);
  return message;
}

export function getRecentMessages(roomId: string, limit = 20): Message[] {
  return db.getRecentMessages(roomId, limit);
}

export function formatMessageView(message: Message): MessageView {
  return {
    type: message.type,
    agentId: message.agentId || undefined,
    agentName: message.agentName || undefined,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
  };
}
