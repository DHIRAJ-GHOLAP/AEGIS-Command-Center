#!/bin/bash
# Military-grade Network Monitoring Dashboard - Startup Script

echo "=========================================================="
echo "    IGNITING NETWORK COMMAND CENTER    "
echo "=========================================================="

echo "[*] Sweeping orphaned processes..."
# Quietly kill any processes clinging to our ports (requires sudo for root processes)
sudo fuser -k 8000/tcp 2>/dev/null
sudo fuser -k 5173/tcp 2>/dev/null

echo -e "\n[*] Booting Frontend UI (Vite)..."
cd frontend
npm run dev -- --host < /dev/null > frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo "\n[*] Booting Backend Engine..."
echo "[!] Sudo password required to authorize raw network socket access (scapy/nmap)"
cd backend
sudo ./venv/bin/uvicorn main:app --port 8000 --host 0.0.0.0

# Trap exit so frontend shuts down when you Ctrl+C the backend
kill $FRONTEND_PID 2>/dev/null
echo "\n[*] System offline."
