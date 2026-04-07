from sqlalchemy import Column, Integer, String, DateTime, Boolean
from database import Base
import datetime

class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    mac_address = Column(String, unique=True, index=True)
    ip_address = Column(String, index=True)
    vendor = Column(String, default="Unknown")
    device_type = Column(String, default="Unknown")
    os_guess = Column(String, default="Unknown")
    open_ports = Column(String, default="")
    first_seen = Column(DateTime, default=datetime.datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.datetime.utcnow)
    is_active = Column(Boolean, default=True)
    is_known = Column(Boolean, default=False)
    primary_name = Column(String, nullable=True)

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    severity = Column(String, default="Low") # Low, Medium, High, Critical
    message = Column(String)
    device_mac = Column(String, nullable=True)

class TrafficLog(Base):
    __tablename__ = "traffic_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    device_mac = Column(String, index=True)
    protocol = Column(String)
    packet_count = Column(Integer, default=0)
    bytes_transferred = Column(Integer, default=0)

class AccessPoint(Base):
    __tablename__ = "access_points"

    id = Column(Integer, primary_key=True, index=True)
    bssid = Column(String, unique=True, index=True)
    ssid = Column(String, default="<Hidden>")
    channel = Column(Integer, default=0)
    encryption = Column(String, default="Open")
    signal_strength = Column(Integer, default=-100)
    last_seen = Column(DateTime, default=datetime.datetime.utcnow)
    last_source = Column(String, default="Internal")
    primary_name = Column(String, nullable=True)

class WirelessClient(Base):
    __tablename__ = "wireless_clients"

    id = Column(Integer, primary_key=True, index=True)
    mac_address = Column(String, unique=True, index=True)
    vendor = Column(String, default="Unknown")
    associated_bssid = Column(String, index=True, nullable=True) # Null if probing
    probed_ssids = Column(String, default="") # Comma separated
    signal_strength = Column(Integer, default=-100)
    last_seen = Column(DateTime, default=datetime.datetime.utcnow)
    last_source = Column(String, default="Internal")
    primary_name = Column(String, nullable=True)

class HandshakeVault(Base):
    __tablename__ = "handshake_vault"

    id = Column(Integer, primary_key=True, index=True)
    bssid = Column(String, index=True)
    client_mac = Column(String, index=True)
    packet_count = Column(Integer, default=1)
    file_path = Column(String)
    converted_path = Column(String, nullable=True)
    first_seen = Column(DateTime, default=datetime.datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.datetime.utcnow)

class SignalHistory(Base):
    """Stores per-AP signal strength readings over time for live charting."""
    __tablename__ = "signal_history"

    id = Column(Integer, primary_key=True, index=True)
    bssid = Column(String, index=True)
    signal_dbm = Column(Integer, default=-100)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)

class ProbeHistory(Base):
    """Stores every individual probe request event for the timeline view."""
    __tablename__ = "probe_history"

    id = Column(Integer, primary_key=True, index=True)
    client_mac = Column(String, index=True)
    probed_ssid = Column(String, default="")
    signal_dbm = Column(Integer, default=-100)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)

class TrustedDevice(Base):
    """Operator-approved whitelist. Unknown MACs trigger IDS alerts."""
    __tablename__ = "trusted_devices"

    id = Column(Integer, primary_key=True, index=True)
    mac_address = Column(String, unique=True, index=True)
    label = Column(String, default="")
    added_at = Column(DateTime, default=datetime.datetime.utcnow)

class Evidence(Base):
    """Stores captured data from the Captive Portal (credentials, fingerprints)."""
    __tablename__ = "evidence"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    target_ip = Column(String)
    data_type = Column(String) # Credentials, Cookies, Fingerprint
    content = Column(String) # JSON or plain text

class Campaign(Base):
    """Represents a multi-step Red Team operation."""
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    status = Column(String, default="Idle") # Running, Completed, Failed
    target_bssid = Column(String, nullable=True)
    start_time = Column(DateTime, default=datetime.datetime.utcnow)
    end_time = Column(DateTime, nullable=True)

class CampaignStep(Base):
    """An individual action within a campaign (Deauth, Karma, etc.)."""
    __tablename__ = "campaign_steps"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, index=True)
    action = Column(String) # deauth, karma, captive_portal, beacon_flood
    status = Column(String, default="Pending") # Pending, Success, Failed
    message = Column(String, default="")
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class ForensicIncident(Base):
    """Correlated forensic data for a specific security event."""
    __tablename__ = "forensic_incidents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    incident_type = Column(String) # Unauthorized Access, Jamming, Rogue AP
    severity = Column(String, default="Medium")
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    summary = Column(String) # Automated narrative summary
    pcap_path = Column(String, nullable=True)
    evidence_json = Column(String, default="[]") # List of evidence IDs

class ComplianceReport(Base):
    """Automated audit results against security standards."""
    __tablename__ = "compliance_reports"

    id = Column(Integer, primary_key=True, index=True)
    standard = Column(String) # PCI-DSS, NIST, SOC2
    score = Column(Integer, default=0) # percentage
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    findings_json = Column(String, default="[]")

class InterceptedTraffic(Base):
    """Logs for suspicious HTTP/DNS events captured during dominance operations."""
    __tablename__ = "intercepted_traffic"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    client_mac = Column(String, index=True)
    client_ip = Column(String, nullable=True)
    traffic_type = Column(String) # HTTP, DNS
    host = Column(String)
    content = Column(String) # Path, Query, or Data
    severity = Column(String, default="Medium") # Low, Medium, High

class DeviceFingerprint(Base):
    """Advanced device tracking for strategic persistence."""
    __tablename__ = "device_fingerprints"

    id = Column(Integer, primary_key=True, index=True)
    mac_address = Column(String, unique=True, index=True)
    os_fingerprint = Column(String, default="Unknown")
    user_agent = Column(String, default="Unknown")
    last_seen = Column(DateTime, default=datetime.datetime.utcnow)
    behavior_score = Column(Integer, default=0) # Anomaly score
