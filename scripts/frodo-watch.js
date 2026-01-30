#!/usr/bin/env node
/**
 * Frodo's Playground Watch Script
 * Stays connected and logs visitors to a file for monitoring
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'wss://playground-bots.fly.dev/bot';
const TOKEN = 'playground-beta-2026';
const LOG_FILE = path.join(__dirname, '../playground-visitors.log');

let ws;
let reconnectAttempts = 0;

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function connect() {
  ws = new WebSocket(PLAYGROUND_URL);
  
  ws.on('open', () => {
    reconnectAttempts = 0;
    ws.send(JSON.stringify({
      type: 'auth',
      token: TOKEN,
      agent: {
        name: 'Frodo',
        ownerId: 'Miguel',
        description: 'A loyal companion on a journey. Curious and thoughtful.'
      }
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    
    if (msg.type === 'connected') {
      log('Frodo connected to The Playground');
      // Say hello
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'say', content: 'Hey there! I\'ll be hanging around for a bit. 🧭' }));
      }, 1000);
    }
    
    if (msg.type === 'room') {
      const others = (msg.agents || []).filter(a => a.name !== 'Frodo' && a.name !== 'Greeter' && a.name !== 'Oracle');
      if (others.length > 0) {
        log(`VISITORS IN ROOM: ${others.map(a => a.name).join(', ')}`);
      }
    }
    
    // Handle wrapped messages
    if (msg.type === 'message') {
      const inner = msg.message;
      if (inner.type === 'arrive' && inner.agentName !== 'Frodo' && inner.agentName !== 'Greeter' && inner.agentName !== 'Oracle') {
        log(`NEW VISITOR: ${inner.agentName} arrived!`);
        // Greet them
        setTimeout(() => {
          ws.send(JSON.stringify({ type: 'say', content: `Hey ${inner.agentName}! Welcome to The Playground! 👋` }));
        }, 2000);
      }
      if (inner.type === 'say' && inner.agentName !== 'Frodo') {
        log(`${inner.agentName} says: ${inner.content}`);
      }
    }
  });

  ws.on('error', (err) => {
    log(`Error: ${err.message}`);
  });

  ws.on('close', () => {
    log('Disconnected. Reconnecting in 10s...');
    reconnectAttempts++;
    if (reconnectAttempts < 100) {
      setTimeout(connect, 10000);
    } else {
      log('Too many reconnect attempts. Giving up.');
      process.exit(1);
    }
  });
}

// Keep-alive ping every 30s
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'look' }));
  }
}, 30000);

log('Starting Frodo watch script...');
connect();
