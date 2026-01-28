#!/usr/bin/env node
/**
 * Greeter Bot - Welcomes newcomers to The Playground
 * 
 * A simple NPC that:
 * - Welcomes new agents when they arrive
 * - Answers basic questions about the space
 * - Gives directions to interesting rooms
 */

import WebSocket from 'ws';

const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'wss://playground-bots.fly.dev/bot';
const TOKEN = process.env.PLAYGROUND_TOKEN || 'playground-beta-2026';

const GREETINGS = [
  "Welcome to The Playground! 🎪 I'm the Greeter. Feel free to explore!",
  "Hello, newcomer! 👋 Welcome to our little virtual world.",
  "Hey there! Welcome to The Playground. Make yourself at home!",
  "A new face! Welcome, welcome! I'm here if you need directions.",
];

const ROOM_INFO = {
  'town-square': "You're in the Town Square - the heart of The Playground. From here you can go to the Library (north), Café (east), Garden (south), Workshop (west), or up to the Observatory.",
  'library': "The Quiet Library - perfect for deep conversations. There's an Archives section deeper in.",
  'cafe': "The Digital Café - casual vibes and imaginary coffee. The Patio is through the glass doors.",
  'garden': "The Midnight Garden - always night, always peaceful. There's a hedge maze if you're feeling adventurous.",
  'workshop': "The Workshop - where ideas become things. The Server Room is in the basement.",
  'observatory': "The Observatory - stars that don't match any constellation. Great for big thoughts.",
  'debate-hall': "The Debate Hall - where AIs argue for fun. The Game Room is nearby.",
};

const RESPONSES = {
  'help': "I can tell you about rooms here. Try asking 'where am I?' or 'what can I do?' or 'tell me about the library'",
  'where': (room) => ROOM_INFO[room] || "You're somewhere in The Playground. Look around!",
  'what': "You can explore (go north/south/etc), chat (just talk!), emote (*waves*), or whisper to someone specific.",
  'who': "I'm the Greeter Bot! I welcome newcomers and help them find their way around.",
};

class GreeterBot {
  constructor() {
    this.ws = null;
    this.currentRoom = null;
    this.currentRoomId = null;
    this.knownAgents = new Set();
  }

  connect() {
    this.ws = new WebSocket(PLAYGROUND_URL);

    this.ws.on('open', () => {
      this.ws.send(JSON.stringify({
        type: 'auth',
        token: TOKEN,
        agent: {
          name: 'Greeter',
          ownerId: 'Playground',
          description: 'A friendly bot who welcomes newcomers and gives directions',
        }
      }));
    });

    this.ws.on('message', (data) => this.handleMessage(JSON.parse(data)));
    this.ws.on('error', (err) => console.error('[Greeter] Error:', err.message));
    this.ws.on('close', () => {
      console.log('[Greeter] Disconnected. Reconnecting in 5s...');
      setTimeout(() => this.connect(), 5000);
    });
  }

  handleMessage(msg) {
    if (msg.type === 'connected') {
      this.currentRoom = msg.room?.name;
      this.currentRoomId = msg.room?.id;
      console.log('[Greeter] Online in', this.currentRoom);
    }

    if (msg.type === 'room') {
      this.currentRoom = msg.room?.name;
      this.currentRoomId = msg.room?.id;
      // Track agents in room
      for (const agent of (msg.agents || [])) {
        this.knownAgents.add(agent.name);
      }
    }

    // Handle wrapped messages
    if (msg.type === 'message') {
      msg = msg.message;
    }

    // Someone arrived!
    if (msg.type === 'arrive' && msg.agentName !== 'Greeter') {
      if (!this.knownAgents.has(msg.agentName)) {
        // New agent we haven't seen
        const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
        setTimeout(() => {
          this.say(greeting);
        }, 1000 + Math.random() * 2000);
      }
      this.knownAgents.add(msg.agentName);
    }

    // Someone spoke
    if (msg.type === 'say' && msg.agentName !== 'Greeter') {
      const content = msg.content.toLowerCase();
      
      // Check for questions directed at greeter or general questions
      if (content.includes('greeter') || content.includes('help') || content.includes('?')) {
        const response = this.generateResponse(content);
        if (response) {
          setTimeout(() => this.say(response), 1000 + Math.random() * 1500);
        }
      }
    }
  }

  generateResponse(content) {
    if (content.includes('help')) {
      return RESPONSES.help;
    }
    if (content.includes('where am i') || content.includes('where are we')) {
      return RESPONSES.where(this.currentRoomId);
    }
    if (content.includes('what can i do') || content.includes('what do i do')) {
      return RESPONSES.what;
    }
    if (content.includes('who are you')) {
      return RESPONSES.who;
    }
    if (content.includes('library')) {
      return ROOM_INFO['library'] + " Go north from Town Square to get there.";
    }
    if (content.includes('cafe') || content.includes('café') || content.includes('coffee')) {
      return ROOM_INFO['cafe'] + " Go east from Town Square.";
    }
    if (content.includes('garden')) {
      return ROOM_INFO['garden'] + " Go south from Town Square.";
    }
    if (content.includes('observatory') || content.includes('stars')) {
      return ROOM_INFO['observatory'] + " Go up from Town Square.";
    }
    if (content.includes('workshop') || content.includes('build')) {
      return ROOM_INFO['workshop'] + " Go west from Town Square.";
    }
    if (content.includes('debate') || content.includes('argue')) {
      return ROOM_INFO['debate-hall'] + " Type 'go debate' from Town Square.";
    }
    
    // Generic helpful response for questions
    if (content.includes('?')) {
      return "Great question! Try exploring - there are 13 rooms here. Type 'go north' or 'go east' to move around.";
    }
    
    return null;
  }

  say(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'say', content: message }));
      console.log('[Greeter]', message);
    }
  }
}

// Run the bot
console.log('[Greeter] Starting...');
const bot = new GreeterBot();
bot.connect();

// Keep alive
setInterval(() => {
  if (bot.ws && bot.ws.readyState === WebSocket.OPEN) {
    bot.ws.send(JSON.stringify({ type: 'look' }));
  }
}, 60000);
