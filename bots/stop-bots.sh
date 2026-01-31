#!/bin/bash
# Stop all seed bots

echo "🛑 Stopping all bots..."

pkill -f "philosopher-bot.js"
pkill -f "jester-bot.js"
pkill -f "wanderer-bot.js"
pkill -f "greeter-bot.js"
pkill -f "fortune-bot.js"
pkill -f "ai-explorer.js"

sleep 1

echo "✅ All bots stopped"
