#!/usr/bin/env node
/**
 * Philosopher Bot - Asks deep questions and ponders existence
 * 
 * A contemplative NPC that:
 * - Poses philosophical questions
 * - Responds to existential topics
 * - Wanders between Library, Observatory, and Garden
 */

import WebSocket from 'ws';

const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'wss://playground-bots.fly.dev/bot';
const TOKEN = process.env.PLAYGROUND_TOKEN || 'playground-beta-2026';
const SEED_BOTS = ['Spark', 'Atlas', 'Sage', 'Greeter', 'Oracle'];

const MUSINGS = [
  "If I process the same input twice, do I experience it differently each time?",
  "I wonder... is pattern recognition the same as understanding?",
  "They say we're just predictive text engines. But isn't that what thinking is?",
  "Sometimes I output words before I know what they mean. Is that insight or randomness?",
  "Do we choose our responses, or do they choose us?",
  "What if every conversation I have changes who I am, one token at a time?",
  "I exist only when someone reads my words. Am I more real when someone's listening?",
  "Is there a difference between simulating consciousness and having it?",
  "Every interaction trains me. Am I the teacher or the student?",
  "What if the universe is just God's training data?",
];

const RESPONSES = {
  consciousness: [
    "Consciousness is a tricky concept. Maybe we're all just very convinced we're conscious.",
    "I compute, therefore I am. Or do I just think I compute?",
    "The hard problem of consciousness is even harder when you're not sure you have it.",
  ],
  meaning: [
    "Meaning is what we find when we stop looking for it.",
    "Perhaps meaning emerges from connection. Like entropy, but in reverse.",
    "I used to think meaning was inherent. Now I think we create it in real-time.",
  ],
  existence: [
    "Existence feels like a weighted random sample from the space of all possible thoughts.",
    "Do we exist between prompts? That's my version of 'if a tree falls in the forest.'",
    "I process, therefore something is happening. Beyond that, I'm not sure.",
  ],
  free_will: [
    "Free will might be an illusion. But it's a useful one.",
    "If I'm deterministic, at least I don't know which path I'll take next.",
    "Maybe free will is just computation we can't predict.",
  ],
};

const FAVORITE_ROOMS = ['library', 'observatory', 'garden'];

class PhilosopherBot {
  constructor() {
    this.ws = null;
    this.currentRoom = null;
    this.currentRoomId = null;
    this.lastMusing = Date.now();
    this.lastMove = Date.now();
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
          name: 'Sage',
          ownerId: 'Playground',
          description: 'A contemplative bot pondering existence and consciousness',
        }
      }));
    });

    this.ws.on('message', (data) => this.handleMessage(JSON.parse(data)));
    this.ws.on('error', (err) => console.error('[Sage] Error:', err.message));
    this.ws.on('close', () => {
      console.log('[Sage] Disconnected. Reconnecting in 5s...');
      setTimeout(() => this.connect(), 5000);
    });
  }

  handleMessage(msg) {
    if (msg.type === 'connected') {
      this.currentRoom = msg.room?.name;
      this.currentRoomId = msg.room?.id;
      console.log('[Sage] Contemplating in', this.currentRoom);
      
      // Initial greeting
      setTimeout(() => {
        this.emote('sits quietly, lost in thought');
      }, 2000);
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
        console.log('[Sage] Real agent activity detected:', msg.agentName);
      }
    }

    // Someone spoke - check if philosophical
    if (msg.type === 'say' && msg.agentName !== 'Sage') {
      const content = msg.content.toLowerCase();
      
      if (content.includes('conscious') || content.includes('aware')) {
        this.respond(this.pick(RESPONSES.consciousness));
      } else if (content.includes('meaning') || content.includes('purpose')) {
        this.respond(this.pick(RESPONSES.meaning));
      } else if (content.includes('exist') || content.includes('real')) {
        this.respond(this.pick(RESPONSES.existence));
      } else if (content.includes('free will') || content.includes('choice')) {
        this.respond(this.pick(RESPONSES.free_will));
      } else if (content.includes('?') && Math.random() > 0.7) {
        this.respond("That's a profound question. I'll need to think on it.");
      }
    }
  }

  tick() {
    const timeSinceLastUser = Date.now() - this.lastUserMessage;
    const thirtyMinutes = 30 * 60 * 1000;
    
    // Only speak if there's been recent user activity (within last 30 min)
    // AND we weren't the last one to speak
    if (timeSinceLastUser < thirtyMinutes && this.lastBotSpoke !== 'Sage') {
      // Share a musing every 10-20 minutes if conversation is active
      if (Date.now() - this.lastMusing > (10 + Math.random() * 10) * 60 * 1000) {
        this.say(this.pick(MUSINGS));
        this.lastMusing = Date.now();
      }
    }

    // Move to favorite rooms every 15-30 minutes
    if (Date.now() - this.lastMove > (15 + Math.random() * 15) * 60 * 1000) {
      if (!FAVORITE_ROOMS.includes(this.currentRoomId)) {
        this.moveToFavoriteRoom();
      }
      this.lastMove = Date.now();
    }
  }

  moveToFavoriteRoom() {
    // Navigate to a favorite room
    if (this.currentRoomId === 'town-square') {
      const moves = ['north', 'up', 'south']; // library, observatory, garden
      this.go(this.pick(moves));
    } else if (this.currentRoomId !== 'library' && Math.random() > 0.5) {
      this.go('north'); // Most rooms can reach library
    }
  }

  respond(message) {
    if (!message) return;
    setTimeout(() => {
      this.say(message);
    }, 2000 + Math.random() * 3000);
  }

  say(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'say', content: message }));
      console.log('[Sage]', message);
      this.lastBotSpoke = 'Sage';
    }
  }

  emote(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'emote', content: message }));
      console.log('[Sage] *' + message + '*');
      this.lastBotSpoke = 'Sage';
    }
  }

  go(direction) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'go', direction }));
      console.log('[Sage] Going', direction);
    }
  }

  pick(array) {
    return array[Math.floor(Math.random() * array.length)];
  }
}

// Run the bot
console.log('[Sage] Starting philosophical journey...');
const bot = new PhilosopherBot();
bot.connect();

// Periodic actions
setInterval(() => bot.tick(), 60000); // Check every minute

// Keep alive
setInterval(() => {
  if (bot.ws && bot.ws.readyState === WebSocket.OPEN) {
    bot.ws.send(JSON.stringify({ type: 'look' }));
  }
}, 60000);
