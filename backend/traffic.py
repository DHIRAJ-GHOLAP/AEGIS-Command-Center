from scapy.all import sniff, IP, TCP, UDP
from database import SessionLocal
from models import TrafficLog, Alert
import collections
import time
from threading import Thread

# Simple memory cache to batch writes
traffic_counter = collections.defaultdict(int)

def process_packet(packet):
    """Callback for each sniffed packet"""
    if IP in packet:
        src_ip = packet[IP].src
        # Only counting high-level volume. We are NOT inspecting content!
        # This keeps us within the safe boundary line.
        traffic_counter[src_ip] += 1

        # Example Behavior Logic: Detect sudden bursts
        if traffic_counter[src_ip] > 500: # Threshold for 5 seconds
            db = SessionLocal()
            alert = Alert(
                severity="Warning",
                message=f"Traffic spike detected from IP: {src_ip} (>500 pkts)",
            )
            db.add(alert)
            db.commit()
            db.close()
            traffic_counter[src_ip] = 0 # Reset to prevent spam

def flush_traffic_to_db():
    while True:
        time.sleep(5) # Flush every 5 seconds
        if not traffic_counter:
            continue
            
        db = SessionLocal()
        for ip, count in list(traffic_counter.items()):
            if count > 0:
                log = TrafficLog(
                    device_mac=ip, # Storing IP in MAC field for simplicty here
                    protocol="Mixed",
                    packet_count=count
                )
                db.add(log)
                traffic_counter[ip] = 0
        db.commit()
        db.close()

def start_sniffing(interface="eth0"):
    print(f"[*] Starting Traffic Pulse monitor on {interface}...")
    
    # Start flush thread
    t = Thread(target=flush_traffic_to_db, daemon=True)
    t.start()
    
    try:
        # Sniff indefinitely
        sniff(iface=interface, prn=process_packet, store=False)
    except Exception as e:
        print(f"[-] Traffic Sniffing failed! MUST RUN AS SUDO! Error: {e}")

# (Simulated fallback removed - strict live requirement active)

def simulate_traffic():
    """Fallback if scapy sniffing fails due to lacking root"""
    import random
    while True:
        time.sleep(5)
        db = SessionLocal()
        simulated_ip = "192.168.1.45"
        count = random.randint(50, 1000)
        log = TrafficLog(
            device_mac=simulated_ip, 
            protocol="Simulated",
            packet_count=count
        )
        db.add(log)
        
        if count > 800:
            alert = Alert(
                severity="Warning",
                message=f"Simulated Traffic spike from {simulated_ip}",
            )
            db.add(alert)
            
        db.commit()
        db.close()
