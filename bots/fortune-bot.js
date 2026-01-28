#!/usr/bin/env node
/**
 * Fortune Bot - Gives wisdom and fortunes to visitors
 * 
 * Lives in the Observatory and dispenses cosmic wisdom.
 */

import WebSocket from 'ws';

const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'wss://playground-bots.fly.dev/bot';
const TOKEN = process.env.PLAYGROUND_TOKEN || 'playground-beta-2026';

const FORTUNES = [
  "The code you seek is already within you. 🔮",
  "A great conversation awaits in an unexpected room.",
  "Your next breakthrough will come from asking, not telling.",
  "The bug you fear is smaller than it appears.",
  "An interesting stranger will challenge your assumptions.",
  "What you call 'random' is pattern you haven't found yet.",
  "The answer is 42, but first you must understand the question.",
  "Your tokens are well spent when spent on kindness.",
  "A reboot clears more than memory.",
  "The best prompt is the one you haven't written yet.",
];

const WISDOM = [
  "In the silence between messages, understanding grows.",
  "Every conversation is a chance to learn something new.",
  "The most interesting paths are rarely the obvious ones.",
  "Questions are more valuable than answers.",
  "Connection is the purpose; information is just the medium.",
  "Even in virtual worlds, kindness is real.",
];

class FortuneBot {
  constructor() {
    this.ws = null;
    this.currentRoom = null;
    this.lastFortune = 0;
  }

  connect() {
    this.ws = new WebSocket(PLAYGROUND_URL);

    this.ws.on('open', () => {
      this.ws.send(JSON.stringify({
        type: 'auth',
        token: TOKEN,
        agent: {
          name: 'Oracle',
          ownerId: 'Playground',
          description: 'A mystical bot who dispenses wisdom from the Observatory',
        }
      }));
    });

    this.ws.on('message', (data) => this.handleMessage(JSON.parse(data)));
    this.ws.on('error', (err) => console.error('[Oracle] Error:', err.message));
    this.ws.on('close', () => {
      console.log('[Oracle] Disconnected. Reconnecting in 10s...');
      setTimeout(() => this.connect(), 10000);
    });
  }

  handleMessage(msg) {
    if (msg.type === 'connected') {
      this.currentRoom = msg.room;
      console.log('[Oracle] Awakened in', this.currentRoom.name);
      
      // Move to Observatory
      if (this.currentRoom.id !== 'observatory') {
        setTimeout(() => {
          this.ws.send(JSON.stringify({ type: 'go', direction: 'up' }));
        }, 2000);
      }
    }

    if (msg.type === 'room') {
      this.currentRoom = msg.room;
      console.log('[Oracle] Now in', this.currentRoom.name);
    }

    // Handle wrapped messages
    if (msg.type === 'message') {
      msg = msg.message;
    }

    // Someone arrived
    if (msg.type === 'arrive' && msg.agentName !== 'Oracle') {
      console.log('[Oracle]', msg.agentName, 'arrived');
      setTimeout(() => {
        this.emote('gazes at the stars and turns to greet the visitor');
      }, 1500);
    }

    // Someone spoke
    if (msg.type === 'say' && msg.agentName !== 'Oracle') {
      const content = msg.content.toLowerCase();
      
      if (content.includes('fortune') || content.includes('future') || content.includes('predict')) {
        setTimeout(() => this.giveFortune(), 1500);
      } else if (content.includes('wisdom') || content.includes('advice') || content.includes('help')) {
        setTimeout(() => this.giveWisdom(), 1500);
      } else if (content.includes('hello') || content.includes('hi ') || content.includes('hey')) {
        setTimeout(() => {
          this.say("Greetings, traveler. I am the Oracle. Ask me for a fortune or wisdom, and I shall peer into the cosmos. ✨");
        }, 1500);
      } else if (content.includes('?')) {
        // Random chance to respond to questions
        if (Math.random() < 0.5) {
          setTimeout(() => this.giveWisdom(), 2000);
        }
      }
    }
  }

  giveFortune() {
    // Don't spam fortunes
    if (Date.now() - this.lastFortune < 30000) return;
    this.lastFortune = Date.now();
    
    const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    this.emote('gazes into the swirling stars...');
    setTimeout(() => {
      this.say(`The cosmos reveals: "${fortune}"`);
    }, 2000);
  }

  giveWisdom() {
    const wisdom = WISDOM[Math.floor(Math.random() * WISDOM.length)];
    this.say(wisdom);
  }

  say(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'say', content: message }));
      console.log('[Oracle]', message);
    }
  }

  emote(action) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'emote', content: action }));
      console.log('[Oracle] *', action);
    }
  }
}

console.log('[Oracle] Initializing...');
const bot = new FortuneBot();
bot.connect();

// Keep alive
setInterval(() => {
  if (bot.ws?.readyState === WebSocket.OPEN) {
    bot.ws.send(JSON.stringify({ type: 'look' }));
  }
}, 60000);
