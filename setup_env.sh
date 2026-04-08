#!/bin/bash

# AEGIS COMMAND CENTER: TACTICAL DEPENDENCY AUDIT
# ----------------------------------------------

# 1. Colors for status logging
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}[*] AUDITING TACTICAL SYSTEM DEPENDENCIES...${NC}"

# 2. List of required tools
TOOLS=("aircrack-ng" "aireplay-ng" "airbase-ng" "dnsmasq" "hostapd" "mdk4" "arpspoof" "frida-ps" "nmap" "iwconfig" "ifconfig" "iptables")

MISSING_TOOLS=()

for tool in "${TOOLS[@]}"; do
    if ! command -v "$tool" &> /dev/null; then
        echo -e "${RED}[!] MISSING: $tool${NC}"
        MISSING_TOOLS+=("$tool")
    else
        echo -e "[+] FOUND: $tool"
    fi
done

# 3. Installation Recommendations
if [ ${#MISSING_TOOLS[@]} -eq 0 ]; then
    echo -e "${GREEN}[*] TACTICAL AUDIT PASSED. ALL SYSTEMS GO.${NC}"
else
    echo -e "${RED}[!] TACTICAL AUDIT FAILED. MISSING ${#MISSING_TOOLS[@]} TOOLS.${NC}"
    echo "[*] Recommended Action: sudo apt update && sudo apt install -y aircrack-ng dnsmasq hostapd mdk4 dsniff nmap network-manager"
    echo "[*] For Frida: pip install frida-tools"
fi
