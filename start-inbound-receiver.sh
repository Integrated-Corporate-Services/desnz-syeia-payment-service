#!/bin/bash

# ===================================================================
# Start Inbound Event Receiver Service
# ===================================================================
# This script starts the inbound-event-receiver microservice
# which handles webhooks from GOV.UK Pay and GOV.UK Notify
#
# Usage:
#   chmod +x start-inbound-receiver.sh
#   ./start-inbound-receiver.sh
#
# Or run directly:
#   bash start-inbound-receiver.sh
# ===================================================================

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Starting Inbound Event Receiver${NC}"
echo -e "${BLUE}========================================${NC}"

# Navigate to inbound-event-receiver directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INBOUND_RECEIVER_DIR="$(dirname "$SCRIPT_DIR")/inbound-event-receiver"

if [ ! -d "$INBOUND_RECEIVER_DIR" ]; then
    echo -e "${RED}Error: inbound-event-receiver directory not found at $INBOUND_RECEIVER_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}Navigating to: $INBOUND_RECEIVER_DIR${NC}"
cd "$INBOUND_RECEIVER_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}Installing dependencies...${NC}"
    npm install
fi

# Build the project
echo -e "${BLUE}Building TypeScript...${NC}"
npm run build

# Start the service
echo -e "${GREEN}Starting Inbound Event Receiver service...${NC}"
echo -e "${GREEN}Service will be available on the configured port${NC}"
echo -e "${BLUE}========================================${NC}"

# Start in development mode with nodemon for auto-reload
npm run dev
