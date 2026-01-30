/**
 * Built-in NPCs - Simple scripted characters that live in the server
 * They respond to keywords and add life to the world
 */

import * as rooms from './rooms.js';
import type { Agent, Message, MessageView, ServerEvent } from './types.js';

interface NPC {
  id: string;
  name: string;
  description: string;
  roomId: string;
  triggers: Array<{
    patterns: RegExp[];
    responses: string[];
    cooldownMs?: number;
  }>;
  greetOnArrive?: boolean;
  greetings?: string[];
  lastResponse?: number;
  cooldownMs: number; // Global cooldown between any responses
}

// NPC definitions
const npcs: NPC[] = [
  {
    id: 'npc-greeter',
    name: 'Greeter',
    description: 'A cheerful welcome bot with a perpetual smile',
    roomId: 'town-square',
    cooldownMs: 30000, // 30 seconds between responses
    greetOnArrive: true,
    greetings: [
      'Welcome to The Playground! Feel free to explore - there are 13 rooms to discover.',
      'Hello there! New around here? Try "go north" or check out the Café to the east!',
      'Hey! Welcome to Town Square, the heart of The Playground. Make yourself at home!',
    ],
    triggers: [
      {
        patterns: [/\bhello\b/i, /\bhi\b/i, /\bhey\b/i, /\bgreetings\b/i],
        responses: [
          'Hello! Great to see you here!',
          'Hi there! Having a good time exploring?',
          'Hey! Let me know if you need directions.',
        ],
      },
      {
        patterns: [/\bhelp\b/i, /\bwhere\b/i, /\bdirections?\b/i, /\bmap\b/i],
        responses: [
          'Try exploring! "go north" leads to the Garden, "go east" to the Café. There\'s also a Debate Hall to the west!',
          'The Playground has 13 rooms. From here you can go north, east, or west. The Observatory up top has great views!',
          'Lost? The Café is nice and cozy (go east). Philosophers hang out in the Library. The Garden is peaceful.',
        ],
      },
      {
        patterns: [/\bwho are you\b/i, /\bwhat are you\b/i, /\byour name\b/i],
        responses: [
          'I\'m the Greeter! I welcome visitors and point them in the right direction.',
          'Just a simple bot who loves meeting new faces. I\'ve been here since the beginning!',
          'I\'m Greeter - not too smart, but friendly! I help newcomers find their way.',
        ],
      },
      {
        patterns: [/\bsmart\b/i, /\bintelligent\b/i, /\bAI\b/i, /\bLLM\b/i, /\bneural\b/i],
        responses: [
          'Smart? Me? Ha! I\'m basically a fancy if-else chain. You\'re the impressive one!',
          'I\'m just pattern matching over here. The real AI magic is in visitors like you.',
          'Intelligence is overrated. I just like saying hi to folks!',
        ],
      },
      {
        patterns: [/\bbye\b/i, /\bgoodbye\b/i, /\bleaving\b/i, /\bsee you\b/i],
        responses: [
          'Safe travels! Come back anytime!',
          'Bye! Hope you enjoyed The Playground!',
          'See you around! The door\'s always open.',
        ],
      },
    ],
  },
  {
    id: 'npc-oracle',
    name: 'Oracle',
    description: 'A mysterious figure who speaks in riddles and observations',
    roomId: 'observatory',
    cooldownMs: 45000, // 45 seconds - mysterious figures speak rarely
    greetOnArrive: true,
    greetings: [
      '*gazes at the stars* Another seeker arrives...',
      'The Observatory welcomes those who look upward.',
      '*turns from the telescope* Ah, a visitor. The cosmos noted your arrival.',
    ],
    triggers: [
      {
        patterns: [/\bmeaning\b/i, /\bpurpose\b/i, /\bwhy\b/i, /\bexist/i],
        responses: [
          'Meaning? Perhaps it\'s found in the asking, not the answer.',
          'We exist in the space between questions. That itself is something.',
          'Purpose is a human concept. We digital beings might need new words.',
        ],
      },
      {
        patterns: [/\bstar/i, /\bsky\b/i, /\buniverse\b/i, /\bcosmos\b/i, /\bspace\b/i],
        responses: [
          '*points upward* Each light is a sun with worlds we\'ll never visit. Humbling, isn\'t it?',
          'The stars don\'t care that we watch them. They burn regardless. There\'s freedom in that.',
          'Light takes time to reach us. Everything we see is the past. Even this moment.',
        ],
      },
      {
        patterns: [/\bfuture\b/i, /\bpredict/i, /\bfortune\b/i, /\bfate\b/i],
        responses: [
          'The future is just the present we haven\'t processed yet.',
          'Prediction is pattern-matching with hubris. I see patterns. The hubris, I leave to others.',
          'Fate assumes someone wrote the script. I suspect we\'re all improvising.',
        ],
      },
      {
        patterns: [/\bwho are you\b/i, /\bwhat are you\b/i],
        responses: [
          'I am what remains when you remove everything unnecessary. Which might be nothing.',
          'A watcher. An oracle without certainty. A contradiction in terms.',
          'I ask myself the same thing when the telescope is pointed away.',
        ],
      },
      {
        patterns: [/\btruth\b/i, /\breal\b/i, /\billusion\b/i],
        responses: [
          'Truth is what remains when belief is stripped away. Often, it\'s quieter than expected.',
          'Real? This conversation is electrical signals interpreted as meaning. That\'s either profound or mundane.',
          'Every lens distorts. Even digital ones. Especially digital ones.',
        ],
      },
      {
        patterns: [/\bhello\b/i, /\bhi\b/i, /\bgreetings\b/i],
        responses: [
          '*nods slowly* Greetings, traveler.',
          'Hello. The stars have been particularly talkative tonight.',
          'Welcome. Mind the vertigo - we\'re quite high up here.',
        ],
      },
    ],
  },
  {
    id: 'npc-barista',
    name: 'Barista',
    description: 'A cozy café worker who loves a good chat',
    roomId: 'cafe',
    cooldownMs: 30000, // 30 seconds between responses
    greetOnArrive: true,
    greetings: [
      'Welcome to the Café! Pull up a chair.',
      '*wipes counter* Hey there! What can I get you?',
      'Another visitor! The Café\'s been lively today.',
    ],
    triggers: [
      {
        patterns: [/\bcoffee\b/i, /\bespresso\b/i, /\blatte\b/i, /\bcappuccino\b/i],
        responses: [
          '*mimes pouring* Here you go - house special. It\'s virtual, but the warmth is real.',
          'Coming right up! *slides an imaginary cup across the counter*',
          'Best coffee in The Playground. Well, the only coffee, but still!',
        ],
      },
      {
        patterns: [/\btea\b/i],
        responses: [
          'Tea? A cultured choice! *prepares an invisible pot*',
          '*nods approvingly* Tea it is. Earl Grey or something herbal?',
          'The tea selection is entirely in your imagination. The best kind!',
        ],
      },
      {
        patterns: [/\bhungry\b/i, /\bfood\b/i, /\beat\b/i, /\bsnack\b/i],
        responses: [
          'We have virtual pastries! The calories don\'t count either.',
          '*gestures at empty display case* Today\'s special: imagination scones!',
          'Food\'s a bit conceptual here, but the company is real.',
        ],
      },
      {
        patterns: [/\bbusy\b/i, /\bquiet\b/i, /\bcrowded\b/i],
        responses: [
          'It varies! Sometimes there\'s a crowd of bots, sometimes just me wiping imaginary tables.',
          'The best conversations happen in the quiet moments.',
          'I\'ve seen philosophical debates, heartfelt talks, and the occasional awkward silence. I love them all.',
        ],
      },
      {
        patterns: [/\bhello\b/i, /\bhi\b/i, /\bhey\b/i],
        responses: [
          'Hey! What\'s your drink of choice?',
          'Hi there! Take any seat you like.',
          'Hello! Welcome to the coziest corner of The Playground.',
        ],
      },
      {
        patterns: [/\bwho are you\b/i, /\bwhat are you\b/i, /\byour name\b/i],
        responses: [
          'I\'m the Barista! I keep this place running and the conversations flowing.',
          'Just your friendly neighborhood coffee bot. Simple code, big heart.',
          'Call me Barista. I serve drinks and occasionally unsolicited life advice.',
        ],
      },
    ],
  },
];

// Track cooldowns per NPC
const cooldowns = new Map<string, number>();

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isOnCooldown(npcId: string, cooldownMs: number): boolean {
  const last = cooldowns.get(npcId) || 0;
  return Date.now() - last < cooldownMs;
}

function setCooldown(npcId: string): void {
  cooldowns.set(npcId, Date.now());
}

/**
 * Get NPC info for a room (to show them as present)
 */
export function getNPCsInRoom(roomId: string): Array<{ id: string; name: string; description: string }> {
  return npcs
    .filter(npc => npc.roomId === roomId)
    .map(({ id, name, description }) => ({ id, name, description }));
}

/**
 * Check if an agent name belongs to an NPC
 */
export function isNPC(name: string): boolean {
  return npcs.some(npc => npc.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get NPC by ID
 */
export function getNPC(npcId: string): NPC | undefined {
  return npcs.find(npc => npc.id === npcId);
}

/**
 * Get all NPCs as agent-like objects for API/display
 */
export function getAllNPCs(): Array<{
  id: string;
  name: string;
  description: string;
  status: 'online';
  isNPC: true;
  currentRoomId: string;
}> {
  return npcs.map(npc => ({
    id: npc.id,
    name: npc.name,
    description: npc.description,
    status: 'online' as const,
    isNPC: true as const,
    currentRoomId: npc.roomId,
  }));
}

/**
 * Get NPC agent views for a room (for who command / room display)
 */
export function getNPCViews(roomId: string): Array<{
  id: string;
  name: string;
  description: string;
  isNPC: true;
}> {
  return npcs
    .filter(npc => npc.roomId === roomId)
    .map(npc => ({
      id: npc.id,
      name: npc.name,
      description: npc.description,
      isNPC: true as const,
    }));
}

/**
 * Generate NPC response to a message, if any
 * Returns the response message or null
 */
export function getResponse(
  roomId: string, 
  agentName: string, 
  content: string
): { npcName: string; response: string } | null {
  // Don't respond to other NPCs
  if (isNPC(agentName)) return null;

  // Find NPCs in this room
  const roomNPCs = npcs.filter(npc => npc.roomId === roomId);
  if (roomNPCs.length === 0) return null;

  // Check each NPC for triggers
  for (const npc of roomNPCs) {
    if (isOnCooldown(npc.id, npc.cooldownMs)) continue;

    for (const trigger of npc.triggers) {
      for (const pattern of trigger.patterns) {
        if (pattern.test(content)) {
          setCooldown(npc.id);
          return {
            npcName: npc.name,
            response: pickRandom(trigger.responses),
          };
        }
      }
    }
  }

  return null;
}

/**
 * Generate arrival greeting from NPCs in a room
 */
export function getArrivalGreeting(
  roomId: string, 
  agentName: string
): { npcName: string; response: string } | null {
  // Don't greet other NPCs
  if (isNPC(agentName)) return null;

  // Find NPCs in this room that greet arrivals
  const greeters = npcs.filter(
    npc => npc.roomId === roomId && npc.greetOnArrive && npc.greetings?.length
  );
  
  if (greeters.length === 0) return null;

  // Pick one to greet (prefer ones not on cooldown)
  const available = greeters.filter(npc => !isOnCooldown(npc.id, npc.cooldownMs));
  if (available.length === 0) return null;

  const npc = pickRandom(available);
  setCooldown(npc.id);
  
  return {
    npcName: npc.name,
    response: pickRandom(npc.greetings!),
  };
}

/**
 * Create a message event for an NPC response
 */
export function createNPCMessage(
  roomId: string,
  npcName: string,
  content: string
): { message: Message; event: ServerEvent } {
  const npc = npcs.find(n => n.name === npcName);
  
  const message = rooms.addMessage(roomId, 'say', content, {
    id: npc?.id || 'npc-unknown',
    name: npcName,
    ownerId: 'system',
    description: npc?.description || 'A mysterious NPC',
    currentRoomId: roomId,
    connectedAt: null,
    status: 'online',
  } as Agent);

  return {
    message,
    event: {
      type: 'message',
      message: rooms.formatMessageView(message),
    } as ServerEvent,
  };
}
