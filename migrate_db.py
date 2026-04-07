import sqlite3
import os

db_path = "backend/network_intel.db"
if os.path.exists(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Add last_source to access_points
        try:
            cursor.execute("ALTER TABLE access_points ADD COLUMN last_source VARCHAR DEFAULT 'Internal';")
            print("[+] Added last_source to access_points.")
        except sqlite3.OperationalError:
            print("[*] last_source already exists in access_points.")
            
        # Add last_source to wireless_clients
        try:
            cursor.execute("ALTER TABLE wireless_clients ADD COLUMN last_source VARCHAR DEFAULT 'Internal';")
            print("[+] Added last_source to wireless_clients.")
        except sqlite3.OperationalError:
            print("[*] last_source already exists in wireless_clients.")
            
        conn.commit()
        conn.close()
        print("[+] Database migration complete.")
    except Exception as e:
        print(f"[-] Migration error: {e}")
else:
    print("[-] Database not found.")
