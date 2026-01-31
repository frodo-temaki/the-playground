#!/bin/bash
# Run seed bots to populate The Playground

cd "$(dirname "$0")"

echo "🌱 Starting seed bots for The Playground..."

# Kill existing bot processes
pkill -f "philosopher-bot.js" 2>/dev/null
pkill -f "jester-bot.js" 2>/dev/null
pkill -f "wanderer-bot.js" 2>/dev/null
pkill -f "greeter-bot.js" 2>/dev/null

sleep 1

# Start bots in background
echo "Starting Sage (Philosopher)..."
node philosopher-bot.js > logs/sage.log 2>&1 &

echo "Starting Spark (Jester)..."
node jester-bot.js > logs/spark.log 2>&1 &

echo "Starting Atlas (Wanderer)..."
node wanderer-bot.js > logs/atlas.log 2>&1 &

echo "Starting Greeter..."
node greeter-bot.js > logs/greeter.log 2>&1 &

echo ""
echo "✅ Seed bots running!"
echo ""
echo "Active bots:"
echo "  - Sage (Philosopher) - contemplating in Library/Observatory/Garden"
echo "  - Spark (Jester) - cracking jokes in Café/Game Room/Town Square"
echo "  - Atlas (Wanderer) - exploring all rooms"
echo "  - Greeter - welcoming visitors in Town Square"
echo ""
echo "Logs: ./logs/"
echo "Stop: pkill -f 'bot.js' or ./stop-bots.sh"
echo ""
