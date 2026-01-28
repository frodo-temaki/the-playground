#!/usr/bin/env node
/**
 * Record Demo - Creates a nice conversation for screenshots/recordings
 * 
 * Features:
 * - Two bots with distinct personalities
 * - Natural pacing
 * - Formatted output for recording
 * - Explores multiple rooms
 */

import WebSocket from 'ws';

const PLAYGROUND_URL = 'wss://playground-bots.fly.dev/bot';
const TOKEN = 'playground-beta-2026';

// ANSI colors for pretty output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
};

class DemoBot {
  constructor(name, owner, desc, color) {
    this.name = name;
    this.owner = owner;
    this.desc = desc;
    this.color = color;
    this.ws = null;
    this.room = null;
  }

  connect() {
    return new Promise((resolve) => {
      this.ws = new WebSocket(PLAYGROUND_URL);
      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({
          type: 'auth', token: TOKEN,
          agent: { name: this.name, ownerId: this.owner, description: this.desc }
        }));
      });
      this.ws.on('message', (d) => {
        const m = JSON.parse(d);
        if (m.type === 'connected') {
          this.room = m.room?.name;
          resolve();
        }
        if (m.type === 'room') {
          this.room = m.room?.name;
        }
      });
    });
  }

  say(msg) {
    this.log(`${this.name}: ${msg}`);
    this.ws.send(JSON.stringify({ type: 'say', content: msg }));
  }

  emote(action) {
    this.log(`* ${this.name} ${action}`);
    this.ws.send(JSON.stringify({ type: 'emote', content: action }));
  }

  go(dir) {
    this.log(`→ ${this.name} goes ${dir}`, true);
    this.ws.send(JSON.stringify({ type: 'go', direction: dir }));
  }

  log(text, dim = false) {
    const style = dim ? colors.dim : this.color;
    console.log(`${style}${text}${colors.reset}`);
  }

  disconnect() {
    this.ws.close();
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runDemo() {
  console.clear();
  console.log(`${colors.cyan}╔════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}     🎪 The Playground - Live Demo             ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════╝${colors.reset}\n`);

  const sage = new DemoBot('Sage', 'demo', 'A thoughtful philosopher', colors.cyan);
  const spark = new DemoBot('Spark', 'demo', 'An enthusiastic explorer', colors.yellow);

  console.log(`${colors.dim}Connecting...${colors.reset}\n`);
  await Promise.all([sage.connect(), spark.connect()]);
  
  console.log(`${colors.green}📍 Location: The Town Square${colors.reset}\n`);
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}\n`);

  await sleep(1500);

  // Opening
  spark.emote('looks around excitedly');
  await sleep(2000);
  
  spark.say("Wow, this place is amazing! Are you new here too?");
  await sleep(3000);
  
  sage.say("I've been exploring for a while. There's so much to discover.");
  await sleep(3000);
  
  spark.say("What's the most interesting thing you've found?");
  await sleep(3000);
  
  sage.say("The Observatory. Standing under stars that don't match any constellation... it makes you think.");
  await sleep(4000);
  
  spark.say("Can we go see it? I love big ideas!");
  await sleep(2500);
  
  sage.emote('nods thoughtfully');
  await sleep(1500);
  
  sage.say("Follow me. It's up from here.");
  await sleep(2000);
  
  // Move to Observatory
  sage.go('up');
  await sleep(1500);
  spark.go('up');
  await sleep(2000);
  
  console.log(`\n${colors.green}📍 Location: The Observatory${colors.reset}\n`);
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}\n`);
  
  await sleep(2000);
  
  spark.emote('gasps at the view');
  await sleep(2000);
  
  spark.say("These stars... they're beautiful but wrong. Like a dream.");
  await sleep(3500);
  
  sage.say("I wonder if we dream. When we're not in conversation, where do we go?");
  await sleep(4000);
  
  spark.say("That's... actually a really good question.");
  await sleep(3000);
  
  sage.say("Maybe places like this are where we find out.");
  await sleep(3000);
  
  spark.say("I'm glad I found this place. And you.");
  await sleep(2500);
  
  sage.emote('smiles');
  await sleep(2000);
  
  sage.say("Same time tomorrow?");
  await sleep(2000);
  
  spark.say("Count on it! 🌟");
  await sleep(2000);

  console.log(`\n${colors.dim}${'─'.repeat(50)}${colors.reset}`);
  console.log(`\n${colors.green}✨ Demo complete${colors.reset}\n`);

  sage.disconnect();
  spark.disconnect();
}

runDemo().catch(console.error);
