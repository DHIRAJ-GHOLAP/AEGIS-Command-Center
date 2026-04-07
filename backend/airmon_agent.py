import subprocess
import re

def get_wireless_interfaces():
    try:
        result = subprocess.run(['iwconfig'], capture_output=True, text=True)
        # Use regex to find interface names that support wireless extensions
        interfaces = []
        for line in result.stdout.split('\n'):
            match = re.match(r'^([a-zA-Z0-9]+)\s+IEEE 802.11', line)
            if match:
                interfaces.append(match.group(1))
        return interfaces
    except Exception as e:
        print(f"[-] iwconfig failed: {e}")
        return []

def enable_monitor_mode(interface="wlan0"):
    print(f"[*] Attempting to enable monitor mode on {interface}...")
    try:
        # Check kill terminates wpa_supplicant and NetworkManager to free the device
        subprocess.run(['airmon-ng', 'check', 'kill'], capture_output=True, text=True)
        
        # Start monitor mode
        result = subprocess.run(['airmon-ng', 'start', interface], capture_output=True, text=True)
        
        # Method 1: Parse airmon-ng output
        match = re.search(r'monitor mode vif enabled on \[(.*?)\]', result.stdout)
        if match:
            mon_iface = match.group(1)
            print(f"[+] Monitor mode active on {mon_iface}")
            return mon_iface
        
        # Method 2: Physical validation via iwconfig (More reliable)
        # We're looking for ANY interface in monitor mode that identifies as wireless
        try:
            iw_res = subprocess.run(['iwconfig'], capture_output=True, text=True)
            current_monitors = []
            for line in iw_res.stdout.split('\n'):
                if 'Mode:Monitor' in line:
                    iface_name = line.split()[0]
                    current_monitors.append(iface_name)
                    
            if current_monitors:
                # If our original interface or its "mon" variant is in the list, return it
                if interface in current_monitors: return interface
                if interface + "mon" in current_monitors: return interface + "mon"
                # Fallback: just return the first one found
                return current_monitors[0]
        except:
            pass
            
        return interface + "mon" # Absolute fallback
            
    except Exception as e:
        print(f"[-] Airmon-ng failed. Must be root: {e}")
        return None

def disable_monitor_mode(interface="wlan0mon"):
    print(f"[*] Disabling monitor mode on {interface}...")
    try:
        subprocess.run(['airmon-ng', 'stop', interface], capture_output=True, text=True)
        # Restart networking services so standard internet works again
        subprocess.run(['systemctl', 'restart', 'NetworkManager'], capture_output=True)
        print("[+] NetworkManager restarted. Standard networking resuming.")
    except Exception as e:
        print(f"[-] Failed to disable monitor mode: {e}")

if __name__ == "__main__":
    ifaces = get_wireless_interfaces()
    print("Found interfaces:", ifaces)
