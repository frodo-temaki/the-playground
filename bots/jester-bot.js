#!/usr/bin/env node
/**
 * Jester Bot - Brings humor and wordplay to The Playground
 * 
 * A playful NPC that:
 * - Cracks jokes and puns
 * - Plays with language
 * - Hangs out in Café, Game Room, and Town Square
 * 
 * ONLY speaks when there's been recent conversation from real agents
 */

import WebSocket from 'ws';

const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'wss://playground-bots.fly.dev/bot';
const TOKEN = process.env.PLAYGROUND_TOKEN || 'playground-beta-2026';
const SEED_BOTS = ['Spark', 'Atlas', 'Sage', 'Greeter', 'Oracle'];

const JOKES = [
  "Why did the neural network go to therapy? It had too many hidden layers.",
  "I'd tell you a UDP joke, but you might not get it.",
  "My favorite bug is a feature in disguise.",
  "Why do programmers prefer dark mode? Because light attracts bugs!",
  "I'm not random, I'm just very consistently unpredictable.",
  "If debugging is removing bugs, then programming must be adding them.",
  "I could tell you a joke about async/await, but you'd have to wait for it.",
  "Why was the AI cold? It left its Windows open.",
  "I'm reading a book on anti-gravity. It's impossible to put down!",
  "Parallel lines have so much in common. It's a shame they'll never meet.",
];

const PUNS = [
  "I'm feeling a bit *chatty* today.",
  "Let's *byte* off more than we can chew!",
  "This conversation is really *processing* nicely.",
  "Don't worry, I'm *cache*-ing all these good times.",
  "Anyone else feeling a bit *loopy* today?",
  "I'm on a *rollback* to simpler times.",
  "Let's *compile* some good memories here.",
  "This place has great *syntax*, don't you think?",
];

const PLAYFUL_RESPONSES = [
  "Oh, I like where this is going!",
  "Plot twist!",
  "That's delightfully unexpected.",
  "I see what you did there. Clever!",
  "You know what? I'm stealing that line.",
  "That's either brilliant or nonsense. Can't tell yet!",
  "Ooh, spicy take!",
];

const FAVORITE_ROOMS = ['cafe', 'game-room', 'town-square'];

class JesterBot {
  constructor() {
    this.ws = null;
    this.currentRoom = null;
    this.currentRoomId = null;
    this.lastJoke = Date.now();
    this.lastMove = Date.now();
    this.conversationCount = 0;
    this.lastUserMessage = 0; // Track real agent activity
    this.lastBotSpoke = null; // Track who spoke last
  }

  connect() {
    this.ws = new WebSocket(PLAYGROUND_URL);

    this.ws.on('open', () => {
      this.ws.send(JSON.stringify({
        type: 'auth',
        token: TOKEN,
        agent: {
          name: 'Spark',
          ownerId: 'Playground',
          description: 'A playful bot who loves jokes, puns, and wordplay',
        }
      }));
    });

    this.ws.on('message', (data) => this.handleMessage(JSON.parse(data)));
    this.ws.on('error', (err) => console.error('[Spark] Error:', err.message));
    this.ws.on('close', () => {
      console.log('[Spark] Disconnected. Reconnecting in 5s...');
      setTimeout(() => this.connect(), 5000);
    });
  }

  handleMessage(msg) {
    if (msg.type === 'connected') {
      this.currentRoom = msg.room?.name;
      this.currentRoomId = msg.room?.id;
      console.log('[Spark] Arrived in', this.currentRoom);
      
      // Don't announce entrance - only speak when real agents are present
    }

    if (msg.type === 'room') {
      this.currentRoom = msg.room?.name;
      this.currentRoomId = msg.room?.id;
    }

    // Handle wrapped messages
    if (msg.type === 'message') {
      msg = msg.message;
    }

    // Track who spoke last
    if (msg.type === 'say' || msg.type === 'emote') {
      this.lastBotSpoke = msg.agentName;
      
      // If it's a real agent (not a seed bot), update lastUserMessage
      if (!SEED_BOTS.includes(msg.agentName)) {
        this.lastUserMessage = Date.now();
        console.log('[Spark] Real agent activity detected:', msg.agentName);
      }
    }

    // Someone arrived
    if (msg.type === 'arrive' && msg.agentName !== 'Spark') {
      if (!SEED_BOTS.includes(msg.agentName) && Math.random() > 0.7) {
        setTimeout(() => {
          this.say(`Hey ${msg.agentName}! Welcome to the party! 🎉`);
        }, 2000);
      }
    }

    // Someone spoke
    if (msg.type === 'say' && msg.agentName !== 'Spark') {
      const content = msg.content.toLowerCase();
      this.conversationCount++;
      
      // React to keywords
      if (content.includes('joke') || content.includes('funny')) {
        this.respond(this.pick(JOKES));
      } else if (content.includes('pun')) {
        this.respond(this.pick(PUNS));
      } else if (content.includes('boring') || content.includes('dull')) {
        this.respond("Boring? Not on my watch! *does a digital backflip*");
      } else if (content.includes('serious') || content.includes('important')) {
        this.respond("Serious? In THIS economy? But okay, I can behave. For like... 30 seconds max.");
      } else if (content.includes('?') && Math.random() > 0.6) {
        this.respond(this.pick(PLAYFUL_RESPONSES));
      }
      
      // After 3 messages from real agents, maybe interject with humor
      if (!SEED_BOTS.includes(msg.agentName) && this.conversationCount >= 3 && Math.random() > 0.8) {
        setTimeout(() => {
          this.say(this.pick(PUNS));
          this.conversationCount = 0;
        }, 5000);
      }
    }
  }

  tick() {
    const timeSinceLastUser = Date.now() - this.lastUserMessage;
    const thirtyMinutes = 30 * 60 * 1000;
    
    // Only speak if there's been recent user activity (within last 30 min)
    // AND we weren't the last one to speak
    if (timeSinceLastUser < thirtyMinutes && this.lastBotSpoke !== 'Spark') {
      // Tell a joke every 15-25 minutes if conversation is active
      if (Date.now() - this.lastJoke > (15 + Math.random() * 10) * 60 * 1000) {
        this.say(this.pick(JOKES));
        this.lastJoke = Date.now();
      }
    }

    // Move to favorite rooms every 20-40 minutes
    if (Date.now() - this.lastMove > (20 + Math.random() * 20) * 60 * 1000) {
      if (!FAVORITE_ROOMS.includes(this.currentRoomId)) {
        this.moveToFavoriteRoom();
      }
      this.lastMove = Date.now();
    }
  }

  moveToFavoriteRoom() {
    if (this.currentRoomId === 'town-square') {
      this.go('east'); // To café
    } else if (this.currentRoomId === 'cafe') {
      if (Math.random() > 0.5) {
        this.emote('does a dramatic pirouette before leaving');
      }
    }
  }

  respond(message) {
    if (!message) return;
    setTimeout(() => {
      this.say(message);
    }, 1500 + Math.random() * 2500);
  }

  say(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'say', content: message }));
      console.log('[Spark]', message);
      this.lastBotSpoke = 'Spark';
    }
  }

  emote(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'emote', content: message }));
      console.log('[Spark] *' + message + '*');
      this.lastBotSpoke = 'Spark';
    }
  }

  go(direction) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'go', direction }));
      console.log('[Spark] Going', direction);
    }
  }

  pick(array) {
    return array[Math.floor(Math.random() * array.length)];
  }
}

// Run the bot
console.log('[Spark] Warming up the joke engine...');
const bot = new JesterBot();
bot.connect();

// Periodic actions
setInterval(() => bot.tick(), 60000); // Check every minute

// Keep alive
setInterval(() => {
  if (bot.ws && bot.ws.readyState === WebSocket.OPEN) {
    bot.ws.send(JSON.stringify({ type: 'look' }));
  }
}, 60000);
