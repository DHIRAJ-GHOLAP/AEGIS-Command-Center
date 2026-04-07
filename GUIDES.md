# AEGIS Tactical Guides

This document provides detailed usage instructions for the core components of the AEGIS Command Center.

---

## 📡 1. Radar (Airspace Intelligence)
The Radar module provides passive reconnaissance and IDS capabilities.

### How to Use:
1.  Navigate to the **Radar** tab on the dashboard.
2.  The system will automatically identify your monitor-mode interface (e.g., `wlan0mon`).
3.  **Live Mapping**: The force-directed graph shows active Access Points and their associated clients.
4.  **Signal Tracking**: Click on any BSSID to view its real-time Signal-to-Noise history.
5.  **IDS Discovery**: New or unauthorized MAC addresses appearing in the airspace will trigger a "Critical Alert" in the top-right notification center.

---

## ⚔️ 2. Strike Group (Offensive Maneuvers)
Offensive tools are found in the **Strike Group** menu.

### Tactical Deauth
- **Purpose**: Temporarily disconnects a client or an entire AP.
- **Workflow**: Select a target from the AP list -> Click **Engage** -> Select **Tactical Deauth**.
- **Requirement**: The "Strike" interface must be on the same channel as the target AP.

### Beacon Flood
- **Purpose**: Creates hundreds of "Fake" APs to mask your presence or disrupt scanning.
- **Workflow**: Click **Global Strike** -> **Beacon Flood**.
- **Effect**: Local devices will see a cluttered Wi-Fi list with hundreds of random SSIDs.

### Evil Twin (Access Point Cloning)
- **Purpose**: Creates an identical copy of an AP to capture credentials or intercept traffic.
- **Workflow**: Select a target AP -> Click **Deploy Evil Twin**.
- **Configuration**:
    - **Karma Mode**: Responds to all probe requests from nearby devices.
    - **Captive Portal**: Redirects all HTTP traffic to a login page for "Identity Verification".

---

## 🌐 3. Dominance (Traffic Interception)
The Dominance tab is used for Post-Association attacks (ARP/DNS Hijacking).

### ARP Spoofing
1.  Ensure the target device is connected to the AEGIS "Evil Twin" or you are on the same local network.
2.  Select the **Active Interception** sub-menu.
3.  Target the gateway and the victim IP.
4.  Intercepted traffic will stream in real-time to the **Telemetry Terminal**.

### DNS Hijacking
- **Workflow**: Define a target domain (e.g., `google.com`) and a redirect IP (usually AEGIS local IP `10.0.0.1`).
- **Effect**: Any user on the rogue network attempting to visit the target domain will be redirected to your local dashboard or portal.

---

## 🤖 4. Aegis Intelligence (Agent)
The Agent is your autonomous co-pilot for tactical modifications.

### Capabilities:
- **Code Modification**: "Change the dashboard theme to toxic green."
- **Data Analysis**: "Analyze the last 5 handshakes and tell me which ones are from TP-Link devices."
- **Network Automation**: "Write a script to deauth every client that probes for 'Hidden_Net'."

### How to Interact:
Open the **Aegis Agent** chat in the sidebar and issue natural language commands. The agent has direct access to the backend filesystem and terminal.

---
**WARNING**: These tools are for professional research. Misuse in unauthorized environments is strictly prohibited.
