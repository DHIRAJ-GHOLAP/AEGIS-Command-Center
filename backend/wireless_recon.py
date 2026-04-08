from scapy.all import sniff, Dot11, Dot11Beacon, Dot11Elt, Dot11ProbeReq, Dot11Deauth, EAPOL, RadioTap, wrpcap, ARP, IP, UDP, DHCP
import string
from database import SessionLocal
from models import AccessPoint, WirelessClient, HandshakeVault, Alert, SignalHistory, ProbeHistory, TrustedDevice
import datetime
from threading import Thread
import os
import time
import subprocess

# Pre-load OUI resolution table
oui_table = {}
try:
    if os.path.exists('/usr/share/nmap/nmap-mac-prefixes'):
        with open('/usr/share/nmap/nmap-mac-prefixes', 'r') as f:
            for line in f:
                if not line.startswith('#') and len(line) > 7:
                    prefix = line[:6].lower()
                    vendor = line[7:].strip()
                    oui_table[prefix] = vendor
except Exception as e:
    print(f"[-] Failed to load OUI table: {e}")

def get_vendor(mac):
    if not mac: return "Unknown"
    prefix = mac.replace(':', '').lower()[:6]
    return oui_table.get(prefix, "Unknown")

# ─── Memory sets to limit DB writes ──────────────────────────────────────────
seen_aps = set()
seen_aps_channels = {}
seen_clients = set()
seen_deauths = set()
seen_ssid_bssid = {}           # ssid -> set of bssids (rogue AP detection)
signal_last_logged = {}        # bssid -> last log timestamp (throttle signal history)
SIGNAL_THROTTLE_SECS = 5      # log signal at most every 5 seconds per AP

# Global queue and ignition check
SIGNAL_QUEUE = None
IGNITION_FUNC = None

# ─── Whitelist Cache (refresh from DB periodically) ──────────────────────────
_trusted_cache = None
_trusted_cache_ts = 0
TRUSTED_CACHE_TTL = 30  # seconds

def get_trusted_macs(db):
    global _trusted_cache, _trusted_cache_ts
    now = time.time()
    if _trusted_cache is None or (now - _trusted_cache_ts) > TRUSTED_CACHE_TTL:
        _trusted_cache = {t.mac_address.upper() for t in db.query(TrustedDevice).all()}
        _trusted_cache_ts = now
    return _trusted_cache

def invalidate_trusted_cache():
    global _trusted_cache
    _trusted_cache = None

# ─── IDS Helpers ─────────────────────────────────────────────────────────────

def check_new_device_ids(db, mac, device_type_label):
    """Fire an alert if this MAC is not in the trusted whitelist."""
    trusted = get_trusted_macs(db)
    if trusted and mac not in trusted:
        alert = Alert(
            severity="High",
            message=f"IDS: Unrecognized {device_type_label} [{mac}] appeared. Not in trusted roster.",
            device_mac=mac
        )
        db.add(alert)
        if SIGNAL_QUEUE:
            SIGNAL_QUEUE.put({"type": "NEW_DEVICE", "data": {"mac": mac, "device_type": device_type_label}})

def check_rogue_ap(db, bssid, ssid):
    """Fire an alert if the same SSID is being broadcast from a different BSSID."""
    if not ssid or ssid == "<Hidden>":
        return
    existing_bssids = seen_ssid_bssid.get(ssid, set())
    if existing_bssids and bssid not in existing_bssids:
        # Another BSSID with the same SSID exists - possible rogue AP
        original = list(existing_bssids)[0]
        alert = Alert(
            severity="Critical",
            message=f"ROGUE AP DETECTED: SSID '{ssid}' broadcast from {bssid} — original known from {original}. Possible Evil Twin!",
            device_mac=bssid
        )
        db.add(alert)
        if SIGNAL_QUEUE:
            SIGNAL_QUEUE.put({"type": "ROGUE_AP", "data": {"bssid": bssid, "ssid": ssid, "original_bssid": original}})
    existing_bssids.add(bssid)
    seen_ssid_bssid[ssid] = existing_bssids

# ─── Packet Handler ───────────────────────────────────────────────────────────

def handle_packet(packet):
    global SIGNAL_QUEUE, IGNITION_FUNC

    if IGNITION_FUNC and not IGNITION_FUNC():
        return

    db = SessionLocal()
    try:
        if packet.haslayer(Dot11):
            signal_dbm = -100
            if packet.haslayer(RadioTap):
                try:
                    signal_dbm = packet[RadioTap].dBm_AntSignal
                except AttributeError:
                    pass

            # ── Access Point Tracking (Beacons) ──────────────────────────────
            if packet.haslayer(Dot11Beacon):
                bssid = packet[Dot11].addr3
                if bssid: bssid = bssid.upper()

                ssid = "<Hidden>"
                channel = 0

                try:
                    payload = packet[Dot11Elt]
                    while payload:
                        if payload.ID == 0:
                            ssid = payload.info.decode('utf-8', errors='ignore')
                        elif payload.ID == 3:
                            channel = int(ord(payload.info))
                        payload = payload.payload
                except:
                    pass

                # --- SSID VALIDATION & DEBUGGING ---
                is_printable = all(c in string.printable for c in ssid) if ssid != "<Hidden>" else True
                is_valid_len = len(ssid) <= 32
                
                if not is_printable or not is_valid_len:
                    print(f"[DEBUG] CORRUPTED SSID DETECTED: '{ssid}' from {bssid} (Len: {len(ssid)}, CH: {channel})")
                    return # Drop corrupted data early

                is_new_ap = bssid not in seen_aps
                if is_new_ap or (channel != 0 and channel != seen_aps_channels.get(bssid)):
                    seen_aps.add(bssid)
                    seen_aps_channels[bssid] = channel

                    ap = db.query(AccessPoint).filter(AccessPoint.bssid == bssid).first()
                    if not ap:
                        ap = AccessPoint(bssid=bssid, ssid=ssid, channel=channel, signal_strength=signal_dbm)
                        db.add(ap)
                        # IDS: new AP appeared
                        check_new_device_ids(db, bssid, "AccessPoint")
                    else:
                        ap.last_seen = datetime.datetime.utcnow()
                        if signal_dbm is not None and signal_dbm < 0:
                            ap.signal_strength = signal_dbm
                        if channel != 0:
                            ap.channel = channel
                    db.commit()

                    if is_new_ap:
                        # Rogue AP check
                        check_rogue_ap(db, bssid, ssid)
                        db.commit()

                    if SIGNAL_QUEUE:
                        SIGNAL_QUEUE.put({"type": "NEW_AP", "data": {"bssid": bssid, "ssid": ssid, "channel": channel, "signal_strength": signal_dbm}})

                # ── Signal History Logger (throttled) ────────────────────────
                now_ts = time.time()
                last = signal_last_logged.get(bssid, 0)
                if (now_ts - last) >= SIGNAL_THROTTLE_SECS and signal_dbm and signal_dbm < 0:
                    signal_last_logged[bssid] = now_ts
                    history_entry = SignalHistory(bssid=bssid, signal_dbm=signal_dbm)
                    db.add(history_entry)
                    db.commit()

                # Append to any open PCAP vaults
                try:
                    for filename in os.listdir("vault"):
                        if filename.startswith(bssid.replace(':', '')) and filename.endswith(".pcap"):
                            wrpcap(f"vault/{filename}", packet, append=True)
                except:
                    pass

            # ── Client Probing ────────────────────────────────────────────────
            elif packet.haslayer(Dot11ProbeReq):
                client_mac = packet[Dot11].addr2
                if client_mac: client_mac = client_mac.upper()
                bssid = packet[Dot11].addr3
                if bssid: bssid = bssid.upper()

                probed_ssid = ""
                try:
                    if packet.haslayer(Dot11Elt) and packet[Dot11Elt].ID == 0:
                        probed_ssid = packet[Dot11Elt].info.decode('utf-8', errors='ignore')
                except:
                    pass

                # --- PROBE VALIDATION ---
                if probed_ssid:
                    is_printable = all(c in string.printable for c in probed_ssid)
                    is_valid_len = len(probed_ssid) <= 32
                    if not is_printable or not is_valid_len:
                        print(f"[DEBUG] CORRUPTED PROBE DETECTED: '{probed_ssid}' from {client_mac} (Len: {len(probed_ssid)})")
                        return

                # Always write probe history (even for known clients)
                if client_mac and probed_ssid:
                    probe_entry = ProbeHistory(
                        client_mac=client_mac,
                        probed_ssid=probed_ssid,
                        signal_dbm=signal_dbm
                    )
                    db.add(probe_entry)
                    db.commit()

                if client_mac and client_mac not in seen_clients:
                    seen_clients.add(client_mac)
                    client = db.query(WirelessClient).filter(WirelessClient.mac_address == client_mac).first()
                    if not client:
                        vendor = get_vendor(client_mac)
                        client = WirelessClient(mac_address=client_mac, probed_ssids=probed_ssid, vendor=vendor, signal_strength=signal_dbm)
                        db.add(client)
                        # IDS: new client
                        check_new_device_ids(db, client_mac, "WirelessClient")
                    else:
                        client.last_seen = datetime.datetime.utcnow()
                        if signal_dbm is not None and signal_dbm < 0:
                            client.signal_strength = signal_dbm
                        if probed_ssid and probed_ssid not in client.probed_ssids:
                            client.probed_ssids += f"{probed_ssid},"
                    db.commit()

                    if SIGNAL_QUEUE:
                        SIGNAL_QUEUE.put({"type": "NEW_CLIENT", "data": {"mac": client_mac, "vendor": get_vendor(client_mac), "signal_strength": signal_dbm}})

                try:
                    if bssid and bssid != "FF:FF:FF:FF:FF:FF":
                        for filename in os.listdir("vault"):
                            if filename.startswith(bssid.replace(':', '')) and filename.endswith(".pcap"):
                                wrpcap(f"vault/{filename}", packet, append=True)
                except:
                    pass

            # ── Data Frames (Client-AP Association) ───────────────────────────
            elif packet.type == 2:
                bssid = packet[Dot11].addr3
                if bssid: bssid = bssid.upper()

                to_ds = packet.FCfield & 0x1
                from_ds = packet.FCfield & 0x2

                client_mac = None
                if to_ds and not from_ds:
                    client_mac = packet[Dot11].addr2
                elif from_ds and not to_ds:
                    client_mac = packet[Dot11].addr1

                if client_mac: client_mac = client_mac.upper()

                if client_mac and bssid and bssid != "FF:FF:FF:FF:FF:FF" and client_mac != bssid:
                    client = db.query(WirelessClient).filter(WirelessClient.mac_address == client_mac).first()
                    if not client:
                        vendor = get_vendor(client_mac)
                        client = WirelessClient(mac_address=client_mac, associated_bssid=bssid, vendor=vendor, signal_strength=signal_dbm)
                        db.add(client)
                        check_new_device_ids(db, client_mac, "WirelessClient")
                    else:
                        changed = client.associated_bssid != bssid
                        client.associated_bssid = bssid
                        client.last_seen = datetime.datetime.utcnow()
                        if signal_dbm is not None and signal_dbm < 0:
                            client.signal_strength = signal_dbm
                        if changed and SIGNAL_QUEUE:
                            SIGNAL_QUEUE.put({"type": "CLIENT_ASSOCIATION", "data": {"mac": client_mac, "bssid": bssid}})
                    
                    # --- [STRATEGIC_IP_CORRELATION] ---
                    # Check for cleartext Layer 3 artifacts (ARP/IP/DHCP)
                    new_ip = None
                    if packet.haslayer(ARP):
                        new_ip = packet[ARP].psrc
                    elif packet.haslayer(IP):
                        new_ip = packet[IP].src
                    elif packet.haslayer(UDP) and (packet[UDP].sport == 68 or packet[UDP].dport == 67):
                        if packet.haslayer(DHCP):
                            # Simplistic DHCP ACK/Offer check
                            new_ip = packet[IP].dst if packet[IP].dst != "255.255.255.255" else "Unknown"

                    if new_ip and new_ip != "0.0.0.0" and new_ip != "Unknown":
                        if client.ip_address != new_ip:
                            client.ip_address = new_ip
                            print(f"[+] AIRSPACE_DOMINANCE: Identified IP {new_ip} for MAC {client_mac}")

                    db.commit()

            # ── EAPOL Handshake Tracking ──────────────────────────────────────
            elif packet.haslayer(EAPOL):
                bssid = packet[Dot11].addr3
                if bssid: bssid = bssid.upper()
                client_mac = packet[Dot11].addr2 if packet[Dot11].addr2 != bssid else packet[Dot11].addr1
                if client_mac: client_mac = client_mac.upper()

                vault_key = f"{bssid}-{client_mac}"
                if vault_key not in seen_clients:
                    seen_clients.add(vault_key)

                    vault_entry = db.query(HandshakeVault).filter(
                        HandshakeVault.bssid == bssid,
                        HandshakeVault.client_mac == client_mac
                    ).first()

                    pcap_path = f"vault/{bssid.replace(':','')}_{client_mac.replace(':','')}.pcap"

                    if not vault_entry:
                        vault_entry = HandshakeVault(bssid=bssid, client_mac=client_mac, file_path=pcap_path)
                        db.add(vault_entry)
                        if SIGNAL_QUEUE:
                            SIGNAL_QUEUE.put({"type": "HANDSHAKE", "data": {"bssid": bssid, "client": client_mac}})
                    else:
                        vault_entry.packet_count += 1
                        vault_entry.last_seen = datetime.datetime.utcnow()
                    db.commit()

                try:
                    pcap_path = f"vault/{bssid.replace(':','')}_{client_mac.replace(':','')}.pcap"
                    wrpcap(pcap_path, packet, append=True)
                except Exception as e:
                    print(f"[-] Failed to write PCAP: {e}")

            # ── Anti-Jamming IDS ──────────────────────────────────────────────
            elif packet.haslayer(Dot11Deauth):
                target = packet[Dot11].addr1
                if target: target = target.upper()
                attacker = packet[Dot11].addr2
                if attacker: attacker = attacker.upper()

                if attacker not in seen_deauths:
                    seen_deauths.add(attacker)
                    alert = Alert(
                        severity="High",
                        message=f"Defensive IDS: Jamming/Deauth attack detected targeting {target} from {attacker}.",
                        device_mac=attacker
                    )
                    db.add(alert)
                    db.commit()
                    if SIGNAL_QUEUE:
                        SIGNAL_QUEUE.put({"type": "ALERT", "data": {"severity": "High", "message": f"Jamming detected near {target}"}})

    except Exception as e:
        print(f"[-] Recon Engine Tactical Error: {e}")
    finally:
        db.close()


def channel_hopper(interface):
    """Background thread to sweep through all channels."""
    channels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    while True:
        for ch in channels:
            try:
                subprocess.run(['iw', 'dev', interface, 'set', 'channel', str(ch)], capture_output=True)
                time.sleep(0.5) # dwell time per channel
            except:
                pass

def start_wireless_sniffing(mon_interface, event_queue=None, ignition_check=None):
    global SIGNAL_QUEUE, IGNITION_FUNC
    SIGNAL_QUEUE = event_queue
    IGNITION_FUNC = ignition_check
    print(f"[*] Binding wireless recon engine to {mon_interface}")
    
    # Start channel hopper
    Thread(target=channel_hopper, args=(mon_interface,), daemon=True).start()
    
    try:
        sniff(iface=mon_interface, prn=handle_packet, store=False)
    except Exception as e:
        print(f"[-] Wireless Sniffing failed: {e}")
