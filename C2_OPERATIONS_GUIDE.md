# AEGIS // COMMAND & CONTROL OPERATIONS GUIDE [v1.5]

> [!IMPORTANT]
> **OPERATIONAL WARNING: ROOT_LEVEL_ACCESS_REQUIRED**
> Most C2 operations (ARP Spoofing, DNS Hijacking, Evil Twin) directly interact with network interfaces and system calls. **SUDO** is mandatory for all tactical deployments.

---

## 🛰️ 1. STRATEGIC HUB (MISSION_CONTROL)
The Central Command for managing long-term operations and automated Red Team sequences.

### 🚩 Automated Campaigns
- **INITIATE CAMPAIGN**: Selecting a Target BSSID and naming the operation triggers a pre-baked sequence:
    1. **DEAUTH_STRIKE** (30s): Forces target clients to disconnect.
    2. **KARMA_SPOOF** (120s): Clones the target AP and captures re-connecting clients.
- **MONITORING**: Real-time progress tracking for every campaign step (SUCCESS/FAILURE/PENDING).

---

## ⚡ 2. AIRSPACE DOMINANCE (INTERCEPTION_CONSOLE)
The core interception suite for Layer 2 and Layer 3 traffic hijacking.

### 🕸️ ARP REDIRECTION (MITM)
- **FUNCTION**: Redirects traffic between a Target IP and the Gateway IP through the AEGIS host.
- **DEPLOYMENT**: Enter **TARGET_IP** and **GATEWAY_IP**, then engage.
- **FEED**: All intercepted DNS queries and HTTP requests are displayed in the **HIJACKED_TELEMETRY** feed.

### 🎭 DNS HIJACKING (DOMAIN_REDIRECTION)
- **FUNCTION**: Redirects specific domain requests (e.g., `google.com`) to a custom IP (e.g., the Captive Portal).
- **DYNAMIC ENGINE (DNSMASQ)**:
    - **ADD SPOOF**: Define domain-to-IP pairs.
    - **ENGAGE SPOOF**: Activates the global redirection engine.
- **INTELLIGENCE**: Uses **Typo-Squatting Detection** to automatically alert you if a client attempts to access visually similar domains (e.g., `bank0famerica.com`).

---

## 💥 3. OFFENSIVE OPS (STRIKE_MANAGEMENT)
The high-fidelity Target Vector Matrix for kinetic engagement.

### 🚀 Target Matrix
- **JAM/STRIKE**: Rapid-fire deauthentication against specific BSSIDs.
- **ADVERSE ENGAGEMENTS**:
    - **EVIL_TWIN**: Deploy a clone AP with a captive portal.
    - **BEACON_FLOOD**: Saturate the airspace with random SSID beacons to disrupt local scanning tools.
    - **KARMA**: Actively responds to probe requests for any remembered network.

---

## 🏛️ 4. FORENSICS LAB (INCIDENT_ANALYSIS)
Deep-dive packet inspection and evidence gathering.

### 🧪 Incident Deep-Dive
- **TRIGGER**: Select an incident from the timeline.
- **DEEP_ANALYSIS**: Spawns a terminal-style analyzer that breaks down captured PCAPs, looking for:
    - Clear-text credentials.
    - User-agent fingerprints.
    - Strategic network artifacts.

---

## 🎯 5. MISSION SCENARIO: FULL_CREDENTIAL_CAPTURE
1. **RECO**: Identify a target client in **Tactical Radar**.
2. **STRIKE**: Launch a **Selective Deauth** via **Offensive Ops**.
3. **CLONE**: Deploy an **Evil Twin** with **Captive Portal** enabled.
4. **HIJACK**: Set a **DNS Redirect** for common login pages (`*.com`) to the portal IP.
5. **EXFIL**: Monitor **Airspace Dominance** for captured credentials and forensic evidence.

---

**AEGIS // Command & Control: OPTIMAL. Airspace: GATED. Operator: ROOT.**
