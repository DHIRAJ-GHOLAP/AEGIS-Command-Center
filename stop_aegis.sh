#!/bin/bash

# AEGIS COMMAND CENTER // TACTICAL SHUTDOWN SEQUENCE
echo -e "\033[1;31m[!] NEUTRALIZING AEGIS_SERVICES...\033[0m"

# 1. Kill Python Backend
echo "[*] Halting Backend Engine (main.py)..."
pkill -f "backend/main.py" 2>/dev/null
pkill -f "backend/comprehensive_monitor.py" 2>/dev/null

# 2. Kill Vite Frontend
echo "[*] Halting Frontend UI (vite)..."
pkill -f "vite" 2>/dev/null

# 3. Kill background bridges/agents
echo "[*] Halting Mission Bridges..."
pkill -f "EVT.py" 2>/dev/null

echo -e "\033[1;32m[✓] ALL_AEGIS_SERVICES_TERMINATED. Airspace: SILENT.\033[0m"
