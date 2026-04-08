#!/bin/bash

# AEGIS COMMAND CENTER: HARDENED TACTICAL LAUNCHER
# -----------------------------------------------

# 1. Colors and Icons
GREEN='\134033[0;32m'
RED='\134033[0;31m'
BLUE='\134033[0;34m'
CYAN='\134033[0;36m'
NC='\134033[0m'
CHECK="[\134033[0;32m+\134033[0m]"
WARN="[\134033[0;33m!\134033[0m]"
INFO="[\134033[0;34m*\134033[0m]"

echo -e "${CYAN}--- AEGIS STRATEGIC DEPLOYMENT ---${NC}"

# 2. Root Validation
if [[ $EUID -ne 0 ]]; then
   echo -e "${WARN} ${RED}PERMISSION_DENIED: TACTICAL DRIVERS REQUIRE ROOT.${NC}"
   echo -e "${INFO} Re-run with: sudo $0"
   exit 1
fi

PROJECT_ROOT=$(pwd)
PID_FILE="$PROJECT_ROOT/.aegis.pids"

# 3. Cleanup Function
neutralize() {
    echo -e "\134n${RED}${INFO} NEUTRALIZING AEGIS PROCESSES...${NC}"
    if [ -f "$PID_FILE" ]; then
        while read pid; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid"
                echo -e "${CHECK} TERMINATED PID $pid"
            fi
        done < "$PID_FILE"
        rm "$PID_FILE"
    fi
    # Hard purge stale ports just in case
    fuser -k 8000/tcp 5173/tcp > /dev/null 2>&1
    echo -e "${CHECK} AIRSPACE CLEARED."
    exit
}

trap neutralize INT TERM

# 4. Port Collision Neutralization
echo -e "${INFO} SCANNIG FOR STALE TACTICAL PORTS..."
fuser -k 8000/tcp 5173/tcp > /dev/null 2>&1

# 5. Backend Deployment
echo -e "${INFO} DEPLOYING BACKEND API [Port 8000]..."
cd backend
./venv/bin/python main.py > "$PROJECT_ROOT/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$PID_FILE"
cd ..

# 6. Frontend Deployment
echo -e "${INFO} DEPLOYING DASHBOARD [Port 5173]..."
cd frontend
npm run dev -- --host 0.0.0.0 > "$PROJECT_ROOT/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID >> "$PID_FILE"
cd ..

# 7. Health Check Loop
echo -e "${INFO} STABILIZING UPLINK..."
SUCCESS=0
for i in {1..30}; do
    API_STABLE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/system/status || echo "fail")
    UI_STABLE=$(lsof -Pi :5173 -sTCP:LISTEN -t)
    
    if [ "$API_STABLE" == "200" ] && [ ! -z "$UI_STABLE" ]; then
        SUCCESS=1
        break
    fi
    echo -n "."
    sleep 2
done

if [ $SUCCESS -eq 1 ]; then
    echo -e "\134n${CHECK} ${GREEN}STRATEGIC UPLINK ESTABLISHED.${NC}"
    echo -e "${INFO} Dashboard: http://localhost:5173"
    echo -e "${INFO} Logs: tail -f backend.log frontend.log"
    
    # Auto-launch interface
    if command -v xdg-open > /dev/null; then xdg-open http://localhost:5173 > /dev/null 2>&1
    elif command -v open > /dev/null; then open http://localhost:5173 > /dev/null 2>&1
    fi
else
    echo -e "\134n${RED}${WARN} CRITICAL: UPLINK FAILED TO STABILIZE.${NC}"
    neutralize
fi

# 8. Persistence
echo -e "${INFO} PRESS CTRL+C TO NEUTRALIZE."
wait
