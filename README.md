# 🛡️ AEGIS Command Center
### **Tactical Network Monitoring & Offensive Engagement Dashboard**

AEGIS is a high-performance, real-time wireless intelligence and offensive engagement platform. Designed for security researchers and penetration testing professionals, it provides a unified "Glass Cockpit" for monitoring 802.11 airspace, detecting intruders, and deploying tactical countermeasures.

---

## ⚡ Core Capabilities

### 📡 1. Airspace Intelligence (Radar)
*   **Passive Reconnaissance**: Real-time sniffing of 802.11 Beacons, Probe Requests, and Data frames.
*   **Topology Graphing**: Live mapping of Client-to-AP associations using Force-Directed Graphs.
*   **Signal Intel**: Chronicling Signal Strength (dBM) history for localized tracking.
*   **Handshake Vault**: Automated capturing and cataloging of WPA2/3 4-way handshakes.

### ⚔️ 2. Offensive Engagement (Strike Group)
*   **Deauth Engine**: Tactical jamming of wireless clients or entire APs via `aireplay-ng`.
*   **Evil Twin (Isolation)**: Advanced Rogue AP deployment using `airbase-ng`, integrated with `dnsmasq` DHCP services and `iptables` NAT routing for full client isolation and internet bridging.
*   **Beacon Flood**: High-velocity noise injection into the spectrum using `mdk4` to disrupt scanning and unauthorized discovery.

### 🚨 3. Autonomous IDS (Threat Board)
*   **Rogue AP Detection**: Identifies unauthorized clones or hidden physical APs in the vicinity.
*   **Unknown Device Alerts**: Real-time notification when a MAC address not in the "Trusted Roster" enters the airspace.
*   **Traffic Pulse**: `Scapy`-based monitoring of packet spikes to detect network stress or exfiltration attempts.

### 🤖 4. Aegis Intelligence (Agent)
*   **Autonomous Coding Agent**: An integrated ReAct-based agent powered by LM Studio or Gemini.
*   **Self-Modifying UI**: The agent can read and modify the project's source code, create new dashboard widgets, or adjust backend logic via the built-in chat interface.

---

## 🛠️ Technical Stack

-   **Frontend**: 
    -   React 18 (Vite) / TypeScript
    -   Styling: Vanilla CSS with Global Design Tokens
    -   Visuals: Lucide-React Icons, Recharts for Live Telemetry
-   **Backend**: 
    -   FastAPI (Python 3.13)
    -   Database: SQLAlchemy + SQLite (Real-time schema migration)
    -   Networking: Scapy, Python-Nmap, Raw Sockets
-   **Execution Layer**: 
    -   `aireplay-ng`, `airbase-ng`, `mdk4`, `dnsmasq`, `hostapd`, `arp-scan`, `iptables`.

---

## 🚀 Deployment

### Hardware Requirements (MANDATORY)
*   **Operating System**: Linux (Kali / Debian / Arch recommended)
*   **Adapters**: Requires **TWO (2)** Wireless adapters supporting **Monitor Mode** and **Packet Injection**.
    *   *Adapter 1 (Intel)*: Used for passive airspace sniffing and IDS.
    *   *Adapter 2 (Strike)*: Dedicated to offensive maneuvers (Deauth/EvilTwin).
*   **System Tools**: `sudo apt install aircrack-ng mdk4 dnsmasq nmap iproute2 wireless-tools hcxtools`.

### Ignition
Simply run the ignition script from the root directory:
```bash
./start.sh
```
*The script will automatically sweep orphaned processes, boot the Vite UI, and initialize the FastAPI backend engine with sudo-level raw socket authorization.*

---

## ⚠️ Legal & Ethical Disclaimer
**FOR EDUCATIONAL AND AUTHORIZED SECURITY RESEARCH PURPOSES ONLY.**
The author is **NOT responsible** for any illegal activity, misuse, or damage caused by the tools provided in this project. AEGIS is intended for use in controlled environments and authorized penetration testing operations. Engaging with wireless networks without explicit owner consent is a criminal offense in most jurisdictions.

---

## 📖 Component Guides
For a detailed breakdown of how to use each tactical tool, refer to the [GUIDES.md](file:///home/flash/Documents/Military-grade%20Network%20Monitoring%20Dashboard/GUIDES.md).

---
**AEGIS** // *Terminal Excellence for Wireless Warfare.*
