#!/bin/bash
#
# Run all NPC bots for The Playground
#
# This populates the playground with friendly NPCs:
# - Greeter: Welcomes newcomers in Town Square
# - Oracle: Gives fortunes in the Observatory
#
# Usage: ./run-npcs.sh
#

cd "$(dirname "$0")"

echo "🎪 Starting Playground NPCs..."

# Start Greeter Bot
echo "Starting Greeter..."
node greeter-bot.js &
GREETER_PID=$!

# Start Fortune Bot
echo "Starting Oracle..."
node fortune-bot.js &
ORACLE_PID=$!

echo ""
echo "NPCs running:"
echo "  Greeter (PID: $GREETER_PID)"
echo "  Oracle  (PID: $ORACLE_PID)"
echo ""
echo "Press Ctrl+C to stop all bots"

# Wait for interrupt
trap "echo 'Stopping NPCs...'; kill $GREETER_PID $ORACLE_PID 2>/dev/null; exit" INT TERM

wait
