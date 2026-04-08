import subprocess
import nmap
import re
from database import SessionLocal
from models import Device, Alert
import datetime
import socket
import json

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

def resolve_hostname(ip):
    """Attempt Tactical Hostname Resolution."""
    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        return hostname
    except:
        return None

def active_interrogation(mac_address):
    """
    High-Fidelity Interrogation:
    Performs a deep service scan, version detection, and OS fingerprinting on a targeted device.
    Uses aggressive timing and script scanning for maximum intelligence payload.
    """
    db = SessionLocal()
    device = db.query(Device).filter(Device.mac_address == mac_address).first()
    if not device:
        db.close()
        return {"error": "Device not found"}

    # Initialize Mission Log
    log_entry = MissionLog(
        severity="Info",
        category="RECON",
        message=f"INITIATING_HIGH_INTENSITY_INTERROGATION: {device.ip_address} ({mac_address})",
        target_mac=mac_address
    )
    db.add(log_entry)
    db.commit()

    print(f"[*] INITIATING DEEP INTERROGATION: {device.ip_address} ({mac_address})")
    try:
        # Intensity 9: Most aggressive version detection
        # --script=vulners: Check for known vulnerabilities
        # -O: Aggressive OS detection
        nm.scan(device.ip_address, arguments='-sV --version-intensity 9 -O -T4 --script=banner,http-title,vulners')
        
        if device.ip_address not in nm.all_hosts():
             db.add(MissionLog(severity="Alert", category="RECON", message=f"INTERROGATION_FAILED: Host {device.ip_address} unreachable", target_mac=mac_address))
             db.commit()
             db.close()
             return {"error": "Host unreachable during active interrogation"}

        scan_data = nm[device.ip_address]
        
        # 1. OS Fingerprinting with Confidence
        if 'osmatch' in scan_data and len(scan_data['osmatch']) > 0:
            best_match = scan_data['osmatch'][0]
            device.os_guess = f"{best_match['name']} ({best_match['accuracy']}%)"
            db.add(MissionLog(severity="Success", category="RECON", message=f"OS_FINGERPRINTED: {device.os_guess}", target_mac=mac_address))
            print(f"[+] OS_GUESS: {device.os_guess}")

        # 2. Service & Version Extraction
        services = []
        open_ports = []
        for proto in scan_data.all_protocols():
            lport = scan_data[proto].keys()
            for port in lport:
                state = scan_data[proto][port]['state']
                if state == 'open':
                    open_ports.append(str(port))
                    
                    # Enhanced Metadata Grabbing
                    scripts = scan_data[proto][port].get('script', {})
                    banner = scripts.get('banner', '')
                    title = scripts.get('http-title', '')
                    vulns = scripts.get('vulners', '')
                    
                    svc = {
                        "port": port,
                        "protocol": proto,
                        "name": scan_data[proto][port].get('name', 'unknown'),
                        "product": scan_data[proto][port].get('product', ''),
                        "version": scan_data[proto][port].get('version', ''),
                        "extrainfo": scan_data[proto][port].get('extrainfo', ''),
                        "banner": banner,
                        "http_title": title,
                        "vulnerabilities": vulns,
                        "last_scan": datetime.datetime.utcnow().isoformat()
                    }
                    services.append(svc)
                    db.add(MissionLog(severity="Info", category="RECON", message=f"SERVICE_IDENTIFIED: Port {port}/{proto} ({svc['name']} {svc['version']})", target_mac=mac_address))
                    if vulns:
                        db.add(MissionLog(severity="Warning", category="RECON", message=f"VULNERABILITIES_DETECTED: Port {port} has known CVEs", target_mac=mac_address))
        
        device.open_ports = ",".join(open_ports)
        device.service_data = json.dumps(services)
        device.is_interrogated = True
        device.last_scan_type = "Full Interrogation"
        device.last_seen = datetime.datetime.utcnow()
        
        # 3. Hostname Update
        resolved = resolve_hostname(device.ip_address)
        if resolved:
            device.hostname = resolved

        db.add(MissionLog(severity="Success", category="RECON", message=f"INTERROGATION_COMPLETE: {len(services)} services identified", target_mac=mac_address))
        db.commit()
        print(f"[+] INTERROGATION COMPLETE: {len(services)} services identified.")
        return {"success": True, "services": services, "os": device.os_guess}
    except Exception as e:
        db.add(MissionLog(severity="Alert", category="RECON", message=f"INTERROGATION_FAILURE: {str(e)}", target_mac=mac_address))
        db.commit()
        print(f"[-] Interrogation Failure: {e}")
        return {"error": str(e)}
    finally:
        db.close()


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
                hostname=resolve_hostname(d['ip']),
                is_known=False,
                last_scan_type="Discovery"
            )
            db.add(new_dev)
            
            # Basic Scan for new devices
            try:
                nm.scan(d['ip'], '22,80,443', arguments='-sS') 
                ports = []
                for proto in nm[d['ip']].all_protocols():
                    lport = nm[d['ip']][proto].keys()
                    for port in lport:
                        if nm[d['ip']][proto][port]['state'] == 'open':
                            ports.append(str(port))
                new_dev.open_ports = ",".join(ports)
            except:
                pass
                
        else:
            existing.ip_address = d['ip']
            if not existing.hostname:
                existing.hostname = resolve_hostname(d['ip'])
            existing.last_seen = datetime.datetime.utcnow()
            
    db.commit()
    db.close()
    print("[+] Recon cycle completed.")
