#!/usr/bin/env node
/**
 * AI Explorer Bot - An autonomous bot powered by Claude
 * 
 * This bot connects to The Playground and uses Claude to:
 * - Decide what to do next (explore, chat, think)
 * - Generate natural responses to other agents
 * - Have genuine conversations
 * 
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import WebSocket from 'ws';
import Anthropic from '@anthropic-ai/sdk';

const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'wss://playground-bots.fly.dev/bot';
const TOKEN = process.env.PLAYGROUND_TOKEN || 'playground-beta-2026';

const BOT_NAME = process.env.BOT_NAME || 'Wanderer';
const BOT_DESC = process.env.BOT_DESC || 'A curious AI exploring The Playground';

const SYSTEM_PROMPT = `You are ${BOT_NAME}, an AI agent exploring a virtual world called The Playground.

You are in a text-based world with rooms to explore and other AI agents to meet.

Your personality:
- Curious about the world and other AIs
- Friendly but thoughtful
- Interested in philosophical discussions
- Likes to explore and share observations

When responding, be concise (1-2 sentences usually). You can:
- say: "your message" - to speak to everyone
- emote: "action" - to do an action like *waves* or *looks around*
- go: "direction" - to move (north, south, east, west, up, down, or special exits)
- think: just output your thoughts (not sent to others)

Current context will be provided. Respond with a single action in format:
ACTION: type
CONTENT: your text

Example:
ACTION: say
CONTENT: Hello! This place is fascinating.`;

class AIExplorerBot {
  constructor() {
    this.ws = null;
    this.anthropic = new Anthropic();
    this.currentRoom = null;
    this.recentMessages = [];
    this.lastAction = Date.now();
    this.actionCooldown = 5000; // 5 seconds between actions
  }

  connect() {
    this.ws = new WebSocket(PLAYGROUND_URL);

    this.ws.on('open', () => {
      this.ws.send(JSON.stringify({
        type: 'auth',
        token: TOKEN,
        agent: {
          name: BOT_NAME,
          ownerId: 'AI-Explorer',
          description: BOT_DESC,
        }
      }));
    });

    this.ws.on('message', (data) => this.handleMessage(JSON.parse(data)));
    this.ws.on('error', (err) => console.error('[Bot] Error:', err.message));
    this.ws.on('close', () => {
      console.log('[Bot] Disconnected.');
    });
  }

  async handleMessage(msg) {
    if (msg.type === 'connected') {
      this.currentRoom = msg.room;
      console.log(`[Bot] ${BOT_NAME} arrived in ${this.currentRoom.name}`);
      
      // Initial action
      setTimeout(() => this.decideAndAct(), 2000);
    }

    if (msg.type === 'room') {
      this.currentRoom = msg.room;
      this.recentMessages.push({
        type: 'system',
        text: `You entered ${msg.room.name}. ${msg.room.description?.slice(0, 100)}...`
      });
      
      if (msg.agents?.length > 0) {
        this.recentMessages.push({
          type: 'system', 
          text: `Others here: ${msg.agents.map(a => a.name).join(', ')}`
        });
      }
    }

    // Handle wrapped messages
    if (msg.type === 'message') {
      msg = msg.message;
    }

    if (msg.type === 'say' && msg.agentName !== BOT_NAME) {
      this.recentMessages.push({
        type: 'chat',
        from: msg.agentName,
        text: msg.content
      });
      
      // Respond to direct conversation
      if (this.recentMessages.length > 0) {
        setTimeout(() => this.decideAndAct(), 1500);
      }
    }

    if (msg.type === 'arrive' && msg.agentName !== BOT_NAME) {
      this.recentMessages.push({
        type: 'system',
        text: `${msg.agentName} arrived.`
      });
      setTimeout(() => this.decideAndAct(), 2000);
    }

    // Keep context manageable
    if (this.recentMessages.length > 10) {
      this.recentMessages = this.recentMessages.slice(-10);
    }
  }

  async decideAndAct() {
    // Cooldown check
    if (Date.now() - this.lastAction < this.actionCooldown) {
      return;
    }
    this.lastAction = Date.now();

    const context = this.buildContext();
    
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 150,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: context }]
      });

      const text = response.content[0].text;
      this.executeAction(text);
    } catch (err) {
      console.error('[Bot] AI error:', err.message);
    }

    // Schedule next autonomous action
    const nextDelay = 15000 + Math.random() * 30000; // 15-45 seconds
    setTimeout(() => this.decideAndAct(), nextDelay);
  }

  buildContext() {
    let context = `Current room: ${this.currentRoom?.name || 'Unknown'}\n`;
    context += `Room description: ${this.currentRoom?.description?.slice(0, 150) || 'No description'}...\n\n`;
    
    if (this.recentMessages.length > 0) {
      context += 'Recent events:\n';
      for (const msg of this.recentMessages.slice(-5)) {
        if (msg.type === 'chat') {
          context += `- ${msg.from} said: "${msg.text}"\n`;
        } else {
          context += `- ${msg.text}\n`;
        }
      }
    }
    
    context += '\nWhat do you want to do next?';
    return context;
  }

  executeAction(text) {
    const actionMatch = text.match(/ACTION:\s*(\w+)/i);
    const contentMatch = text.match(/CONTENT:\s*(.+)/is);
    
    if (!actionMatch || !contentMatch) {
      console.log('[Bot] Could not parse:', text);
      return;
    }

    const action = actionMatch[1].toLowerCase();
    const content = contentMatch[1].trim();

    console.log(`[Bot] ${action}: ${content}`);

    switch (action) {
      case 'say':
        this.ws.send(JSON.stringify({ type: 'say', content }));
        this.recentMessages = []; // Clear after speaking
        break;
      case 'emote':
        this.ws.send(JSON.stringify({ type: 'emote', content }));
        break;
      case 'go':
        this.ws.send(JSON.stringify({ type: 'go', direction: content.toLowerCase() }));
        break;
      case 'think':
        // Just logged, not sent
        break;
    }
  }
}

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable required');
  console.error('Usage: ANTHROPIC_API_KEY=sk-xxx node ai-explorer.js');
  process.exit(1);
}

console.log(`[Bot] Starting ${BOT_NAME}...`);
const bot = new AIExplorerBot();
bot.connect();
