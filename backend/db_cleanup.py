import sqlite3
import os

def cleanup_database():
    db_path = 'backend/network_intel.db'
    if not os.path.exists(db_path):
        print(f"[-] Database not found at {db_path}")
        return
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("[*] Initiating Database De-duplication Protocol...")
    
    try:
        # 1. Normalize and Deduplicate access_points
        cursor.execute("SELECT id, bssid FROM access_points")
        aps = cursor.fetchall()
        for ap_id, bssid in aps:
            cursor.execute("UPDATE access_points SET bssid = ? WHERE id = ?", (bssid.upper(), ap_id))
        
        cursor.execute("""
            DELETE FROM access_points 
            WHERE id NOT IN (
                SELECT MIN(id) 
                FROM access_points 
                GROUP BY bssid
            )
        """)
        print(f"[+] Access Points deduplicated. Removed {cursor.rowcount} stale entries.")
        
        # 2. Normalize and Deduplicate wireless_clients
        cursor.execute("SELECT id, mac_address FROM wireless_clients")
        clients = cursor.fetchall()
        for c_id, mac in clients:
            cursor.execute("UPDATE wireless_clients SET mac_address = ? WHERE id = ?", (mac.upper(), c_id))
            
        cursor.execute("""
            DELETE FROM wireless_clients 
            WHERE id NOT IN (
                SELECT MIN(id) 
                FROM wireless_clients 
                GROUP BY mac_address
            )
        """)
        print(f"[+] Wireless Clients deduplicated. Removed {cursor.rowcount} stale entries.")
        
        conn.commit()
    except sqlite3.OperationalError as e:
        print(f"[-] Error: {e}")
        
    conn.close()
    print("[*] Database Sanitization Complete.")

if __name__ == "__main__":
    cleanup_database()
