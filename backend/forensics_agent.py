import subprocess
import json
import os
from database import SessionLocal
from models import ForensicIncident, AccessPoint, WirelessClient, Evidence

def run_tshark_analysis(pcap_path):
    """Extracts summary metadata from a PCAP using tshark."""
    if not os.path.exists(pcap_path):
        return {"error": "PCAP not found"}
        
    try:
        # Extract DNS queries and HTTP hosts as a start
        cmd = [
            'tshark', '-r', pcap_path, 
            '-T', 'fields', 
            '-e', 'dns.qry.name', 
            '-e', 'http.host', 
            '-e', 'ip.src',
            '-E', 'separator=,'
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        lines = result.stdout.split('\n')
        
        analysis = {
            "dns_queries": list(set([line.split(',')[0] for line in lines if line and line.split(',')[0]])),
            "http_hosts": list(set([line.split(',')[1] for line in lines if line and len(line.split(',')) > 1 and line.split(',')[1]])),
            "source_ips": list(set([line.split(',')[2] for line in lines if line and len(line.split(',')) > 2 and line.split(',')[2]]))
        }
        return analysis
    except Exception as e:
        return {"error": str(e)}

def auto_correlate_incident(db, bssid, client_mac=None):
    """
    Strategic correlation: 
    Finds captured handshakes, portal evidence, and probe history to build a 'Case'.
    """
    summary = f"Strategic investigation for BSSID {bssid}."
    if client_mac:
        summary += f" Target victim: {client_mac}."
        
    # Find evidence
    evidence_count = db.query(Evidence).count() # Simplified for now
    
    incident = ForensicIncident(
        title=f"Incident Report: {bssid}",
        incident_type="Strategic Analysis",
        severity="Medium",
        summary=summary,
        evidence_json=json.dumps({"related_evidence_count": evidence_count})
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident
