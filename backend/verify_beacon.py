import socket
import time

def listen_for_beacon():
    print("[*] AEGIS TACTICAL BEACON DETECTOR")
    print("[*] Listening on UDP Port 5555 for Hub Broadcast...")
    
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(('', 5555))
    
    # Set a 15-second timeout to give the server time to pulse
    sock.settimeout(15.0)
    
    try:
        data, addr = sock.recvfrom(1024)
        print(f"\n[+] BEACON ACQUIRED!")
        print(f"    Source IP: {addr[0]}")
        print(f"    Payload:   {data.decode()}")
        print("\n[*] Nodes on this network will now autonomously lock onto this coordinate.")
    except socket.timeout:
        print("\n[-] SIGNAL LOST: No beacon detected within 15 seconds.")
        print("[!] Ensure './start.sh' is running and the backend is active.")
    except Exception as e:
        print(f"[-] ERROR: {e}")
    finally:
        sock.close()

if __name__ == "__main__":
    listen_for_beacon()
