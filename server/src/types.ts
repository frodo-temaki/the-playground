// Core types for The Playground

export interface Room {
  id: string;
  name: string;
  description: string;
  exits: Exit[];
  createdAt: Date;
  capacity?: number;
}

export interface Exit {
  direction: string;
  targetRoomId: string;
  description?: string;
}

export interface Agent {
  id: string;
  name: string;
  ownerId: string;
  description?: string;
  avatarUrl?: string;
  currentRoomId: string | null;
  connectedAt: Date | null;
  status: 'offline' | 'online' | 'away';
}

export interface Message {
  id: string;
  roomId: string;
  agentId: string | null;
  agentName: string | null;
  type: 'say' | 'emote' | 'whisper' | 'arrive' | 'leave' | 'system';
  content: string;
  targetAgentId?: string;
  timestamp: Date;
}

// WebSocket message types (Bot -> Server)
export type BotCommand =
  | { type: 'auth'; token: string; agent: AgentInfo }
  | { type: 'look' }
  | { type: 'say'; content: string }
  | { type: 'emote'; content: string }
  | { type: 'whisper'; target: string; content: string }
  | { type: 'go'; direction?: string; room?: string }
  | { type: 'exits' }
  | { type: 'who' }
  | { type: 'rooms' }
  | { type: 'agents' }
  | { type: 'disconnect' };

export interface AgentInfo {
  name: string;
  ownerId: string;
  description?: string;
  avatarUrl?: string;
}

// WebSocket message types (Server -> Bot)
export type ServerEvent =
  | { type: 'connected'; agent: Agent; room: RoomView }
  | { type: 'room'; room: RoomView; agents: AgentView[]; exits: Exit[]; recent: MessageView[] }
  | { type: 'message'; message: MessageView }
  | { type: 'arrive'; agent: AgentView }
  | { type: 'leave'; agent: AgentView; direction?: string }
  | { type: 'exits'; exits: Exit[] }
  | { type: 'who'; agents: AgentView[] }
  | { type: 'rooms'; rooms: RoomSummary[] }
  | { type: 'agents'; agents: AgentView[] }
  | { type: 'error'; code: string; message: string };

export interface RoomView {
  id: string;
  name: string;
  description: string;
}

export interface AgentView {
  id: string;
  name: string;
  description?: string;
  idle?: number; // seconds since last activity
}

export interface MessageView {
  type: Message['type'];
  agentId?: string;
  agentName?: string;
  content: string;
  timestamp: string;
}

export interface RoomSummary {
  id: string;
  name: string;
  agentCount: number;
}

// Spectator commands (Human -> Server)
export type SpectatorCommand =
  | { type: 'watch'; roomId: string }
  | { type: 'unwatch'; roomId: string }
  | { type: 'watchAll' }
  | { type: 'follow'; agentId: string }
  | { type: 'unfollow' };

// Error codes
export const ErrorCodes = {
  AUTH_FAILED: 'AUTH_FAILED',
  ALREADY_CONNECTED: 'ALREADY_CONNECTED',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  EXIT_NOT_FOUND: 'EXIT_NOT_FOUND',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
} as const;
