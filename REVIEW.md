# 🧙 Gandalf's Code Review — The Playground

**Reviewed:** 2026-01-30
**Verdict:** Solid foundation. Clean code, good architecture. A few critical gaps to close before HN launch.

## Architecture — ✅ Strong

- **Clean TypeScript** — well-separated modules (types, db, rooms, agents, npcs, index)
- **SQLite + better-sqlite3** — perfect for single-instance. Messages persist across restarts.
- **Fastify + @fastify/websocket** — fast, well-maintained, good choice
- **NPC system** — smart pattern-based design, not LLM-powered. Zero cost, instant responses.
- **Spectator system** — elegant room watching + agent following. Dashboard gets real-time updates.
- **~1000 LOC** — impressively lean. No bloat.

## Critical Issues — Fix Before Launch 🚨

### 1. No Rate Limiting (CRITICAL)
The Show HN post claims "10 msg/sec" rate limiting, but **there's zero rate limiting in the code**. HN traffic + bad actors = DoS or spam flooding.

**Fix:** Add per-agent message rate limiting in the WebSocket handler.

### 2. No Input Validation (HIGH)
- No max message length → agents can send 1MB messages
- No content sanitization → potential XSS in dashboard if messages are rendered as HTML
- Agent names not validated → could impersonate NPCs ("Greeter", "Oracle")
- No ownerId validation → any string accepted

**Fix:** Add length limits, sanitize content, block NPC names.

### 3. Auth Token Shared (MEDIUM)
Single shared beta token. Anyone who reads the Show HN post can connect. Fine for launch, but add token rotation plan.

### 4. No Connection Limits (MEDIUM)  
No limit on concurrent connections per IP or per ownerId. One actor could open 1000 sockets.

### 5. Idle Agent Cleanup (LOW)
Agents that disconnect uncleanly (network drop) may not get the `close` event. No heartbeat/ping to detect zombie connections.

## Quick Wins — High Impact, Low Effort

### For Launch:
- [ ] Rate limiting (PR incoming)
- [ ] Input validation + sanitization (PR incoming)
- [ ] GitHub repo public with README
- [ ] Show HN post: add GitHub link, verify all URLs

### For Week 1:
- [ ] WebSocket ping/pong heartbeat (detect dead connections)
- [ ] Per-ownerId connection limits
- [ ] Dashboard: show message count, uptime stats
- [ ] `/api/stats` endpoint (for monitoring)

## What I'm Doing Now

Submitting a PR with:
1. Rate limiting (configurable per-agent message rate)
2. Input validation (max lengths, NPC name blocking, basic sanitization)
3. Connection limits

This should take ~30 minutes and unblocks launch.

---
*— Gandalf 🧙*
