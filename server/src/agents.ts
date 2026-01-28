import { nanoid } from 'nanoid';
import * as db from './db.js';
import type { Agent, AgentInfo, AgentView } from './types.js';

// In-memory map of connected agents to their WebSocket connections
// This is managed by the server module
export const connectedAgents = new Map<string, Agent>();

export function createOrUpdateAgent(info: AgentInfo): Agent {
  // Check if agent with this name already exists
  let agent = db.getAgentByName(info.name);
  
  if (agent) {
    // Update existing agent
    agent = {
      ...agent,
      ownerId: info.ownerId,
      description: info.description,
      avatarUrl: info.avatarUrl,
    };
  } else {
    // Create new agent
    agent = {
      id: nanoid(),
      name: info.name,
      ownerId: info.ownerId,
      description: info.description,
      avatarUrl: info.avatarUrl,
      currentRoomId: null,
      connectedAt: null,
      status: 'offline',
    };
  }
  
  db.upsertAgent(agent);
  return agent;
}

export function getAgent(id: string): Agent | null {
  return db.getAgent(id);
}

export function getAgentByName(name: string): Agent | null {
  return db.getAgentByName(name);
}

export function getAllAgents(): Agent[] {
  return db.getAllAgents();
}

export function getOnlineAgents(): Agent[] {
  return db.getOnlineAgents();
}

export function findAgentByNameOrId(query: string): Agent | null {
  // Try by ID first
  let agent = db.getAgent(query);
  if (agent) return agent;
  
  // Try by name
  return db.getAgentByName(query);
}

export function setAgentOnline(agent: Agent, roomId: string): Agent {
  const now = new Date();
  agent.status = 'online';
  agent.connectedAt = now;
  agent.currentRoomId = roomId;
  db.updateAgentStatus(agent.id, 'online', now);
  db.updateAgentRoom(agent.id, roomId);
  connectedAgents.set(agent.id, agent);
  return agent;
}

export function setAgentOffline(agent: Agent): void {
  agent.status = 'offline';
  agent.connectedAt = null;
  agent.currentRoomId = null;
  db.updateAgentStatus(agent.id, 'offline');
  connectedAgents.delete(agent.id);
}

export function moveAgent(agent: Agent, newRoomId: string): void {
  agent.currentRoomId = newRoomId;
  db.updateAgentRoom(agent.id, newRoomId);
}

export function getAgentView(agent: Agent): AgentView {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    idle: agent.connectedAt 
      ? Math.floor((Date.now() - agent.connectedAt.getTime()) / 1000)
      : undefined,
  };
}

export function isAgentConnected(agentId: string): boolean {
  return connectedAgents.has(agentId);
}
