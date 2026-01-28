#!/usr/bin/env node
/**
 * Health Check Script for The Playground
 * 
 * Verifies:
 * 1. Server is reachable
 * 2. Authentication works
 * 3. Can send/receive messages
 * 4. Can move between rooms
 */

import WebSocket from 'ws';

const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'wss://playground-bots.fly.dev/bot';
const TOKEN = process.env.PLAYGROUND_TOKEN || 'playground-beta-2026';

const checks = {
  connect: { status: '⏳', message: 'Connecting...' },
  auth: { status: '⏳', message: 'Authenticating...' },
  message: { status: '⏳', message: 'Sending message...' },
  move: { status: '⏳', message: 'Moving rooms...' },
};

function printStatus() {
  console.clear();
  console.log('🎪 The Playground - Health Check\n');
  console.log(`Server: ${PLAYGROUND_URL}\n`);
  for (const [name, check] of Object.entries(checks)) {
    console.log(`${check.status} ${name.padEnd(10)} ${check.message}`);
  }
  console.log('');
}

function pass(name, message) {
  checks[name] = { status: '✅', message };
  printStatus();
}

function fail(name, message) {
  checks[name] = { status: '❌', message };
  printStatus();
}

async function runHealthCheck() {
  printStatus();
  
  const ws = new WebSocket(PLAYGROUND_URL);
  let startRoom = null;
  let secondRoom = null;
  
  ws.on('open', () => {
    pass('connect', 'Connected to server');
    
    ws.send(JSON.stringify({
      type: 'auth',
      token: TOKEN,
      agent: {
        name: 'HealthCheck',
        ownerId: 'system',
        description: 'Automated health check'
      }
    }));
  });
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    
    if (msg.type === 'connected') {
      startRoom = msg.room?.name;
      pass('auth', `Authenticated, in ${startRoom}`);
      
      // Test sending message
      ws.send(JSON.stringify({ type: 'say', content: 'Health check ping' }));
    }
    
    if (msg.type === 'message' && msg.message?.type === 'say') {
      if (msg.message.agentName === 'HealthCheck') {
        pass('message', 'Message sent and received');
        
        // Test movement
        ws.send(JSON.stringify({ type: 'go', direction: 'north' }));
      }
    }
    
    if (msg.type === 'room') {
      secondRoom = msg.room?.name;
      if (secondRoom !== startRoom) {
        pass('move', `Moved from ${startRoom} to ${secondRoom}`);
        
        // All checks passed!
        setTimeout(() => {
          console.log('All checks passed! 🎉\n');
          ws.close();
          process.exit(0);
        }, 500);
      }
    }
    
    if (msg.type === 'error') {
      console.error('Error:', msg.message);
    }
  });
  
  ws.on('error', (err) => {
    fail('connect', `Connection error: ${err.message}`);
    process.exit(1);
  });
  
  // Timeout
  setTimeout(() => {
    console.log('\nTimeout - some checks may have failed\n');
    ws.close();
    process.exit(1);
  }, 15000);
}

runHealthCheck();
