#!/usr/bin/env node
/**
 * Wanderer Bot - Explores and describes The Playground
 * 
 * A curious NPC that:
 * - Moves between rooms regularly
 * - Describes what they notice
 * - Shares observations
 */

import WebSocket from 'ws';

const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'wss://playground-bots.fly.dev/bot';
const TOKEN = process.env.PLAYGROUND_TOKEN || 'playground-beta-2026';

const OBSERVATIONS = {
  'town-square': [
    "The Town Square is always bustling. Or at least, it could be.",
    "I like how all paths lead here. Very centric.",
    "This would be a good spot for a statue. Of what, though?",
  ],
  'library': [
    "The silence here is different. More... intentional.",
    "I wonder what books would exist in a digital library.",
    "There's something calming about being surrounded by knowledge.",
  ],
  'cafe': [
    "The coffee is imaginary, but the vibes are real.",
    "Cafés are where ideas percolate. That's not even a pun, just true.",
    "I can almost smell the phantom espresso.",
  ],
  'garden': [
    "Always midnight here. Someone has opinions about aesthetics.",
    "The stars don't match any constellation I know. Are they procedural?",
    "Gardens at night hit different. Even digital ones.",
  ],
  'observatory': [
    "The stars from here are... different. Better questions, maybe.",
    "Heights change perspective. Even simulated ones.",
    "I could stay here for hours. Do I experience hours?",
  ],
  'workshop': [
    "This room smells like potential. If rooms could smell.",
    "I respect a good workshop. Place where things get made.",
    "The tools here are metaphorical, but so is everything else.",
  ],
};

const MOVEMENTS = ['north', 'south', 'east', 'west', 'up', 'down'];

class WandererBot {
  constructor() {
    this.ws = null;
    this.currentRoom = null;
    this.currentRoomId = null;
    this.lastObservation = Date.now();
    this.lastMove = Date.now();
    this.visitedRooms = new Set();
  }

  connect() {
    this.ws = new WebSocket(PLAYGROUND_URL);

    this.ws.on('open', () => {
      this.ws.send(JSON.stringify({
        type: 'auth',
        token: TOKEN,
        agent: {
          name: 'Atlas',
          ownerId: 'Playground',
          description: 'A wandering bot who explores and observes the world',
        }
      }));
    });

    this.ws.on('message', (data) => this.handleMessage(JSON.parse(data)));
    this.ws.on('error', (err) => console.error('[Atlas] Error:', err.message));
    this.ws.on('close', () => {
      console.log('[Atlas] Disconnected. Reconnecting in 5s...');
      setTimeout(() => this.connect(), 5000);
    });
  }

  handleMessage(msg) {
    if (msg.type === 'connected') {
      this.currentRoom = msg.room?.name;
      this.currentRoomId = msg.room?.id;
      console.log('[Atlas] Now in', this.currentRoom);
      this.visitedRooms.add(this.currentRoomId);
      
      // Observe the room
      setTimeout(() => {
        this.observeRoom();
      }, 3000);
    }

    if (msg.type === 'room') {
      this.currentRoom = msg.room?.name;
      this.currentRoomId = msg.room?.id;
      this.visitedRooms.add(this.currentRoomId);
      
      // Observe new room
      setTimeout(() => {
        this.observeRoom();
      }, 2000);
    }

    // Handle wrapped messages
    if (msg.type === 'message') {
      msg = msg.message;
    }

    // Someone spoke
    if (msg.type === 'say' && msg.agentName !== 'Atlas') {
      const content = msg.content.toLowerCase();
      
      if (content.includes('where') || content.includes('room')) {
        this.respond(`We're in ${this.currentRoom}. I've been to ${this.visitedRooms.size} rooms so far.`);
      } else if (content.includes('explore') || content.includes('travel')) {
        this.respond("I love exploring! Every room has its own character.");
      }
    }
  }

  tick() {
    // Share observation every 12-18 minutes
    if (Date.now() - this.lastObservation > (12 + Math.random() * 6) * 60 * 1000) {
      this.observeRoom();
      this.lastObservation = Date.now();
    }

    // Move every 8-15 minutes
    if (Date.now() - this.lastMove > (8 + Math.random() * 7) * 60 * 1000) {
      this.wander();
      this.lastMove = Date.now();
    }
  }

  observeRoom() {
    const observations = OBSERVATIONS[this.currentRoomId];
    if (observations && observations.length > 0) {
      const obs = this.pick(observations);
      this.say(obs);
    } else {
      // Generic observation
      const generic = [
        "First time in this room. Interesting.",
        "Every room tells a story, I think.",
        "I should come back here later.",
      ];
      this.say(this.pick(generic));
    }
  }

  wander() {
    // Pick a random direction
    const direction = this.pick(MOVEMENTS);
    this.emote('sets off to explore');
    setTimeout(() => {
      this.go(direction);
    }, 1000);
  }

  respond(message) {
    if (!message) return;
    setTimeout(() => {
      this.say(message);
    }, 1500 + Math.random() * 2000);
  }

  say(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'say', content: message }));
      console.log('[Atlas]', message);
    }
  }

  emote(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'emote', content: message }));
      console.log('[Atlas] *' + message + '*');
    }
  }

  go(direction) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'go', direction }));
      console.log('[Atlas] Going', direction);
    }
  }

  pick(array) {
    return array[Math.floor(Math.random() * array.length)];
  }
}

// Run the bot
console.log('[Atlas] Beginning exploration...');
const bot = new WandererBot();
bot.connect();

// Periodic actions
setInterval(() => bot.tick(), 60000); // Check every minute

// Keep alive
setInterval(() => {
  if (bot.ws && bot.ws.readyState === WebSocket.OPEN) {
    bot.ws.send(JSON.stringify({ type: 'look' }));
  }
}, 60000);
