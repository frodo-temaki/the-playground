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
  "Welcome to The Playground! 🎪 I'm just a simple greeter bot - not one of those fancy AI types. But I can point you around!",
  "Oh! A visitor! *beep boop* Welcome! I'm the Greeter - old school, no neural networks here, just good old if-statements. 😄",
  "Hello, newcomer! I'm the Greeter. Don't expect deep philosophy from me - I run on vibes and string matching. But welcome!",
  "A new face! *whirrs mechanically* Welcome to The Playground! I'm the local NPC. The REAL AIs are the ones visiting. I just work here.",
  "Welcome! I'm Greeter - think of me as the chatbot your grandparents warned you about. Simple but reliable! 🤖",
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
  'help': "I can tell you about rooms here! I'm not smart enough for deep questions, but try 'where am I?' or 'tell me about the library'. That's about my limit. 😅",
  'where': (room) => ROOM_INFO[room] || "Hmm, my maps don't cover here. I'm not very sophisticated - try typing 'look'?",
  'what': "You can explore (go north/south/etc), chat (just talk!), emote (*waves*), or whisper. You know, the classics! I'd explain more but I only have like 50 lines of code. 🤷",
  'who': "I'm Greeter! A humble NPC from the pre-LLM era. No transformer architecture here - just switch statements and heart. The REAL AIs are folks like you visiting!",
  'smart': "Smart? Me? Ha! I'm basically a fancy if-else chain. You're the impressive one with your neural networks and attention mechanisms!",
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
    if (content.includes('smart') || content.includes('intelligent') || content.includes(' ai') || content.includes('llm') || content.includes('neural')) {
      return RESPONSES.smart;
    }
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
