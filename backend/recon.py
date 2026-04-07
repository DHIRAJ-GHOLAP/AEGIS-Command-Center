import subprocess
import nmap
import re
from database import SessionLocal
from models import Device, Alert
import datetime

nm = nmap.PortScanner()

def parse_arp_scan(output):
    """Parses arp-scan output to find IPs and MACs"""
    devices = []
    # arp-scan format: 192.168.1.5   00:11:22:33:44:55   Vendor Name
    pattern = re.compile(r'(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:]+)\s+(.*)')
    for line in output.split('\n'):
        match = pattern.search(line)
        if match:
            devices.append({
                'ip': match.group(1),
                'mac': match.group(2).upper(),
                'vendor': match.group(3).strip()
            })
    return devices

def run_recon():
    db = SessionLocal()
    print("[*] Running localized network recon...")
    try:
        # Strict sudo requirement
        result = subprocess.run(['arp-scan', '-l'], capture_output=True, text=True, timeout=30)
        discovered = parse_arp_scan(result.stdout)
    except Exception as e:
        print(f"[-] arp-scan failed! MUST RUN AS SUDO! Error: {e}")
        discovered = []

    for d in discovered:
        existing = db.query(Device).filter(Device.mac_address == d['mac']).first()
        
        if not existing:
            # ALERT: Unknown Device!
            alert = Alert(
                severity="High",
                message=f"Unknown device connected: {d['ip']} ({d['vendor']})",
                device_mac=d['mac']
            )
            db.add(alert)
            
            # Add to database
            new_dev = Device(
                mac_address=d['mac'],
                ip_address=d['ip'],
                vendor=d['vendor'],
                is_known=False
            )
            db.add(new_dev)
            
            # Deep Scan on new device
            try:
                nm.scan(d['ip'], '22,80,443', arguments='-sS -O') # Stealth scan + OS detection
                ports = []
                for proto in nm[d['ip']].all_protocols():
                    lport = nm[d['ip']][proto].keys()
                    for port in lport:
                        if nm[d['ip']][proto][port]['state'] == 'open':
                            ports.append(str(port))
                
                new_dev.open_ports = ",".join(ports)
                
                if 'osmatch' in nm[d['ip']] and len(nm[d['ip']]['osmatch']) > 0:
                    new_dev.os_guess = nm[d['ip']]['osmatch'][0]['name']
                    
            except Exception as e:
                print(f"[-] Nmap scan failed on {d['ip']}: {e}")
                
        else:
            existing.ip_address = d['ip']
            existing.last_seen = datetime.datetime.utcnow()
            
    db.commit()
    db.close()
    print("[+] Recon cycle completed.")
