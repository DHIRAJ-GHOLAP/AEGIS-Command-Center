import { useState, useEffect, useMemo, useRef } from 'react';
import { Shield, Activity, Radio, AlertTriangle, Search, Wifi, Zap, Lock, Signal, Map, Crosshair, BarChart2, Tag, Check, X, Bell, BellOff, Download, Skull, Users, ShieldAlert, History, Siren, Trash2, Cpu } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import ForceGraph3D from 'react-force-graph-3d';
import axios from 'axios';
import { AegisAgent } from './components/AegisAgent';

const API_BASE = 'http://localhost:8000';

// Widget for Access Points
function APCard({ ap, toggleDeauth, isAttacking, onSelect, isSelected, onLabel }: any) {
  const displayName = ap.primary_name || ap.ssid;
  const isLabeled = !!ap.primary_name;
  return (
    <div 
      onClick={() => onSelect(ap.bssid)}
      className={`glass-panel ${isSelected ? 'selected-target' : ''}`} 
      style={{ 
        padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', 
        cursor: 'pointer', border: isSelected ? '1px solid var(--accent-primary)' : undefined,
        boxShadow: isSelected ? '0 0 20px rgba(0,242,254,0.2)' : undefined
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ color: isLabeled ? 'var(--accent-primary)' : (ap.ssid === '<Hidden>' ? 'var(--accent-warn)' : '#fff'), fontSize: '1.1rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {isLabeled && <Tag size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />}
            {displayName}
            {isSelected && (
              <span className="radar-pulse" style={{ fontSize: '0.6rem', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', padding: '1px 4px', borderRadius: '2px', fontWeight: 'bold' }}>
                LOCKED
              </span>
            )}
          </h4>
          {isLabeled && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '0.15rem' }}>{ap.ssid}</div>
          )}
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--accent-secondary)' }}>{ap.bssid}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          <span style={{ fontSize: '0.75rem', color: ap.signal_strength > -60 ? 'var(--accent-success)' : ap.signal_strength > -80 ? 'var(--accent-warn)' : 'var(--accent-danger)' }}>
             {ap.signal_strength} dBm
          </span>
          <Signal size={16} color={ap.signal_strength > -50 ? 'var(--accent-success)' : 'var(--accent-warn)'}/>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>CH {ap.channel}</span>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
          <Lock size={12} /> {ap.encryption || 'OPEN'}
        </div>
        
        <button
          onClick={(e) => { e.stopPropagation(); onLabel({ id: ap.bssid, currentLabel: ap.primary_name || '', type: 'AP', displayName: ap.ssid }); }}
          className="tactical-btn"
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', opacity: 0.8 }}>
          <Tag size={12} /> {ap.primary_name ? 'RELABEL' : 'LABEL'}
        </button>

        <button 
          onClick={(e) => { e.stopPropagation(); toggleDeauth(ap.bssid); }}
          style={{ marginLeft: 'auto' }}
          className={`tactical-btn ${isAttacking ? 'warn' : 'danger'}`}>
          <Zap size={14} /> {isAttacking ? 'HALT STRIKE' : 'JAM RADAR'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [trafficData, setTrafficData] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  
  const [accessPoints, setAccessPoints] = useState<any[]>([]);
  const [wirelessClients, setWirelessClients] = useState<any[]>([]);
  const [activeAttacks, setActiveAttacks] = useState<string[]>([]);
  const [handshakes, setHandshakes] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('Airspace Radar');
  const [hoveredTarget, setHoveredTarget] = useState<any>(null);
  const [uplinkStatus, setUplinkStatus] = useState('SEARCHING...');
  const [selectedBSSID, setSelectedBSSID] = useState<string | null>(null);
  const [interrogationClients, setInterrogationClients] = useState<any[]>([]);

  // Identity Labeling State
  const [labelingTarget, setLabelingTarget] = useState<{ id: string; currentLabel: string; type: string; displayName: string } | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [labelSaving, setLabelSaving] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // ── New Feature State ────────────────────────────────────────────────────
  const [evilTwinActive, setEvilTwinActive] = useState(false);
  const [beaconFloodActive, setBeaconFloodActive] = useState(false);
  const [whitelist, setWhitelist] = useState<any[]>([]);
  const [whitelistInput, setWhitelistInput] = useState('');
  const [whitelistLabel, setWhitelistLabel] = useState('');
  const [signalHistory, setSignalHistory] = useState<any[]>([]);
  const [signalHistoryBSSID, setSignalHistoryBSSID] = useState<string | null>(null);
  const [probeHistory, setProbeHistory] = useState<any[]>([]);
  const [probeHistoryMAC, setProbeHistoryMAC] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifsEnabled, setNotifsEnabled] = useState(false);
  // ── Tactical Expansion State (Phase 1) ───────────────────────────────────
  const [karmaMode, setKarmaMode] = useState(false);
  const [captivePortal, setCaptivePortal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [forensicIncidents, setForensicIncidents] = useState<any[]>([]);
  const [complianceReport, setComplianceReport] = useState<any>(null);
  const [interceptedTraffic, setInterceptedTraffic] = useState<any[]>([]);
  
  const [evilTwinTarget, setEvilTwinTarget] = useState<any>(null);
  const [beaconFloodChannel, setBeaconFloodChannel] = useState(6);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const fetchFullState = async () => {
    try {
      const [trfRes, altRes, apRes, clientRes, atkRes, vaultRes, wlRes] = await Promise.all([
        axios.get(`${API_BASE}/api/traffic`),
        axios.get(`${API_BASE}/api/alerts`),
        axios.get(`${API_BASE}/api/wireless/ap`),
        axios.get(`${API_BASE}/api/wireless/clients`),
        axios.get(`${API_BASE}/api/attack/status`),
        axios.get(`${API_BASE}/api/vault`),
        axios.get(`${API_BASE}/api/identity/whitelist`),
      ]);
      
      setAccessPoints(apRes.data);
      setWirelessClients(clientRes.data);
      setAlerts(altRes.data);
      setActiveAttacks(atkRes.data.active_attacks || []);
      setEvilTwinActive(atkRes.data.evil_twin_active || false);
      setBeaconFloodActive(atkRes.data.beacon_flood_active || false);
      setHandshakes(vaultRes.data);
      setWhitelist(wlRes.data);
      
      const formattedTraffic = trfRes.data.reverse().map((t: any) => ({
        time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        packets: t.packet_count
      }));
      setTrafficData(formattedTraffic.length > 0 ? formattedTraffic : [{ time: 'Waiting for traffic...', packets: 0 }]);
      
      // Phase 2 Strategic Fetch
      const [campRes, forenPlease, compRes] = await Promise.all([
        axios.get(`${API_BASE}/api/strategic/campaigns`),
        axios.get(`${API_BASE}/api/strategic/forensics`),
        axios.get(`${API_BASE}/api/strategic/compliance`)
      ]);
      setCampaigns(campRes.data);
      setForensicIncidents(forenPlease.data);
      setComplianceReport(compRes.data);

      const trafficRes = await axios.get(`${API_BASE}/api/dominance/traffic`);
      setInterceptedTraffic(trafficRes.data);
    } catch (e) {
      console.error("Telemetry Sync Failed", e);
    }
  };

  useEffect(() => {
    // Initial Sync
    fetchFullState();

    // Establish Tactical WebSocket Uplink
    const wsUrl = API_BASE.replace('http', 'ws') + '/api/tactical/stream';
    let socket = new WebSocket(wsUrl);

    const connectWS = () => {
      socket.onopen = () => {
        setUplinkStatus('ESTABLISHED');
        console.log('[+] Tactical Uplink Established.');
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        console.log('[*] Pulse Event:', payload.type);

        // Sound + Browser Notification helper
        const fireThreatAlert = (title: string, body: string, freq = 880) => {
          // Web Audio beep
          if (soundEnabled) {
            try {
              if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
              const ctx = audioCtxRef.current;
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain); gain.connect(ctx.destination);
              osc.frequency.value = freq;
              osc.type = 'square';
              gain.gain.setValueAtTime(0.15, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
              osc.start(); osc.stop(ctx.currentTime + 0.4);
            } catch {}
          }
          // Browser Notification
          if (notifsEnabled && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/favicon.ico' });
          }
        };

        switch(payload.type) {
          case 'NEW_AP':
          case 'EXTERNAL_SCAN':
          case 'NEW_CLIENT':
          case 'HANDSHAKE':
            fetchFullState();
            break;
          case 'NEW_DEVICE':
            fetchFullState();
            fireThreatAlert('⚠ UNRECOGNIZED DEVICE', `New ${payload.data?.device_type || 'device'} detected: ${payload.data?.mac}`, 660);
            break;
          case 'ROGUE_AP':
            fetchFullState();
            fireThreatAlert('🚨 ROGUE AP DETECTED', `SSID '${payload.data?.ssid}' from unknown source: ${payload.data?.bssid}`, 1100);
            break;
          case 'CLIENT_ASSOCIATION':
            if (payload.data.bssid === selectedBSSID) {
              axios.get(`${API_BASE}/api/wireless/ap/${selectedBSSID}/clients`)
                .then(res => setInterrogationClients(res.data));
            }
            fetchFullState();
            break;
          case 'ATTACK_UPDATE':
            fetchFullState();
            break;
          case 'ALERT':
            fetchFullState();
            fireThreatAlert('🔴 IDS ALERT', payload.data?.message || 'New security event detected', 880);
            break;
          default:
            break;
        }
      };

      socket.onclose = () => {
        setUplinkStatus('LINK_LOST');
        console.warn('[-] Tactical Uplink Lost. Reconnecting...');
        setTimeout(() => {
          socket = new WebSocket(wsUrl);
          connectWS();
        }, 5000);
      };
    };

    connectWS();

    // Fallback sync (every 60s for safety)
    const safetySync = setInterval(fetchFullState, 60000);
    return () => {
      clearInterval(safetySync);
      socket.close();
    };
  }, []);

  useEffect(() => {
    if (selectedBSSID) {
      const fetchInterrogation = async () => {
        try {
          const res = await axios.get(`${API_BASE}/api/wireless/ap/${selectedBSSID}/clients`);
          setInterrogationClients(res.data);
        } catch (e) {
          console.error("Interrogation Uplink Failed.");
        }
      };
      fetchInterrogation();
      const interval = setInterval(fetchInterrogation, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedBSSID]);

  const toggleDeauth = async (bssid: string) => {
    const normalizedBssid = bssid.toUpperCase();
    try {
      if (activeAttacks.includes(normalizedBssid)) {
        const res = await axios.post(`${API_BASE}/api/attack/stop`, { bssid: normalizedBssid });
        if (!res.data.success) alert(`Cease Fire Failed: ${res.data.error}`);
      } else {
        const res = await axios.post(`${API_BASE}/api/attack/deauth`, { bssid: normalizedBssid });
        if (!res.data.success) alert(`Tactical Failure: ${res.data.error}`);
      }
      // Immediate feedback loop
      fetchFullState();
    } catch (e) {
      alert("API Node Offline or Command Blocked.");
    }
  };

  const handleConvert = async (hs_id: number) => {
    try {
      const res = await axios.post(`${API_BASE}/api/vault/convert/${hs_id}`);
      if (res.data.status === 'success') {
          alert(`Tactical Extraction Complete: ${res.data.converted_path}`);
      } else {
          alert(`Error: ${res.data.message}`);
      }
    } catch (e) {
      console.error(e);
      alert("Conversion Terminal Failed.");
    }
  };

  // Identity Labeling Handlers
  const openLabelModal = (target: { id: string; currentLabel: string; type: string; displayName: string }) => {
    setLabelingTarget(target);
    setLabelInput(target.currentLabel || '');
    setTimeout(() => labelInputRef.current?.focus(), 50);
  };

  const closeLabelModal = () => {
    setLabelingTarget(null);
    setLabelInput('');
  };

  const saveLabel = async () => {
    if (!labelingTarget) return;
    setLabelSaving(true);
    try {
      await axios.post(`${API_BASE}/api/identity/label`, {
        mac_address: labelingTarget.id,
        label: labelInput
      });
      await fetchFullState();
      if (selectedBSSID) {
        const res = await axios.get(`${API_BASE}/api/wireless/ap/${selectedBSSID}/clients`);
        setInterrogationClients(res.data);
      }
      closeLabelModal();
    } catch (e) {
      alert('Identity Uplink Failed. Check backend.');
    } finally {
      setLabelSaving(false);
    }
  };

  // ── Offensive Handlers ────────────────────────────────────────────────────
  const launchEvilTwin = async () => {
    if (!evilTwinTarget) return;
    try {
      const res = await axios.post(`${API_BASE}/api/attack/evil-twin`, {
        bssid: evilTwinTarget.bssid, 
        ssid: evilTwinTarget.ssid, 
        channel: evilTwinTarget.channel,
        karma_mode: karmaMode,
        captive_portal: captivePortal
      });
      if (!res.data.success) alert(`Evil Twin Failed: ${res.data.error}`);
      fetchFullState();
    } catch { alert('Evil Twin: API Unreachable'); }
  };

  const exportTacticalData = async () => {
    setExportLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/tactical/export`);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `aegis_tactical_export_${new Date().toISOString()}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (e) {
      alert("Intelligence Extraction Failed.");
    } finally {
      setExportLoading(false);
    }
  };

  const stopEvilTwin = async () => {
    try {
      await axios.post(`${API_BASE}/api/attack/evil-twin/stop`);
      fetchFullState();
    } catch { alert('Stop Evil Twin: API Unreachable'); }
  };

  const launchBeaconFlood = async () => {
    try {
      const res = await axios.post(`${API_BASE}/api/attack/beacon-flood`, { channel: beaconFloodChannel });
      if (!res.data.success) alert(`Beacon Flood Failed: ${res.data.error}`);
      fetchFullState();
    } catch { alert('Beacon Flood: API Unreachable'); }
  };

  const stopBeaconFlood = async () => {
    try {
      await axios.post(`${API_BASE}/api/attack/beacon-flood/stop`);
      fetchFullState();
    } catch { alert('Stop Beacon Flood: API Unreachable'); }
  };

  // ── Whitelist Handlers ────────────────────────────────────────────────────
  const addToWhitelist = async () => {
    if (!whitelistInput.trim()) return;
    try {
      await axios.post(`${API_BASE}/api/identity/whitelist`, { mac_address: whitelistInput.trim(), label: whitelistLabel.trim() });
      setWhitelistInput(''); setWhitelistLabel('');
      fetchFullState();
    } catch { alert('Whitelist update failed'); }
  };

  const removeFromWhitelist = async (mac: string) => {
    try {
      await axios.delete(`${API_BASE}/api/identity/whitelist/${encodeURIComponent(mac)}`);
      fetchFullState();
    } catch { alert('Remove from whitelist failed'); }
  };

  // ── Signal / Probe History ────────────────────────────────────────────────
  const loadSignalHistory = async (bssid: string) => {
    setSignalHistoryBSSID(bssid);
    try {
      const res = await axios.get(`${API_BASE}/api/signal/history/${bssid}`);
      setSignalHistory(res.data.map((r: any) => ({
        time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        signal: r.signal_dbm
      })));
    } catch { setSignalHistory([]); }
  };

  const loadProbeHistory = async (mac: string) => {
    setProbeHistoryMAC(mac);
    try {
      const res = await axios.get(`${API_BASE}/api/probes/history/${mac}`);
      setProbeHistory(res.data);
    } catch { setProbeHistory([]); }
  };

  // ── Notification Permission ───────────────────────────────────────────────
  const requestNotifPermission = async () => {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') setNotifsEnabled(true);
  };

  // ── Export Helpers ────────────────────────────────────────────────────────
  const downloadExport = (format: 'json' | 'csv') => {
    window.open(`${API_BASE}/api/export/${format}`, '_blank');
  };

  // derived data for visuals
  const uniqueAccessPoints = useMemo(() => {
    const seen = new Set();
    return accessPoints.filter(ap => {
      ap.bssid = ap.bssid.toUpperCase(); // HARD NORMALIZATION
      if (seen.has(ap.bssid)) return false;
      seen.add(ap.bssid);
      return true;
    });
  }, [accessPoints]);

  const graphData = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];
    
    uniqueAccessPoints.forEach(ap => {
      nodes.push({ id: ap.bssid, name: ap.ssid, type: 'ap', val: 5, color: 'var(--accent-primary)' });
    });
    
    wirelessClients.forEach(client => {
      nodes.push({ id: client.mac_address, name: client.vendor || client.mac_address, type: 'client', val: 2, color: 'var(--accent-warn)' });
      if (client.probed_ssids) {
        const probes = client.probed_ssids.split(',').filter(Boolean);
        probes.forEach((probe: string) => {
          const targetAp = uniqueAccessPoints.find(a => a.ssid === probe);
          if (targetAp) {
             links.push({ source: client.mac_address, target: targetAp.bssid });
          }
        });
      }
    });

    return { nodes, links };
  }, [uniqueAccessPoints, wirelessClients]);

  const heatmapData = useMemo(() => {
    const channels: any = {};
    for (let c=1; c<=13; c++) channels[c] = 0;
    uniqueAccessPoints.forEach(ap => {
      if (ap.channel > 0 && ap.channel <= 13) channels[ap.channel]++;
    });
    return Object.keys(channels).map(ch => ({ channel: `CH ${ch}`, count: channels[ch] }));
  }, [uniqueAccessPoints]);

  return (
    <div className="app-container">
      {/* Identity Label Modal */}
      {labelingTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={closeLabelModal}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{
            width: '420px', padding: '2rem',
            border: '1px solid var(--accent-primary)',
            boxShadow: '0 0 40px rgba(0,242,254,0.15)',
            display: 'flex', flexDirection: 'column', gap: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--accent-primary)', letterSpacing: '0.15em', marginBottom: '0.4rem' }}>IDENTITY PROTOCOL // ALIAS ASSIGNMENT</div>
                <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Tag size={18} className="title-glow" /> Assign Friendly Name</h3>
              </div>
              <button onClick={closeLabelModal} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '0.2rem' }}><X size={20} /></button>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.75rem', borderRadius: '6px', borderLeft: '3px solid var(--accent-secondary)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>TARGET — {labelingTarget.type}</div>
              <div style={{ fontFamily: 'monospace', color: 'var(--accent-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{labelingTarget.id}</div>
              <div style={{ color: '#fff', fontSize: '0.9rem', marginTop: '0.1rem' }}>{labelingTarget.displayName}</div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.08em', display: 'block', marginBottom: '0.5rem' }}>OPERATOR ALIAS (leave blank to clear label)</label>
              <input
                ref={labelInputRef}
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') closeLabelModal(); }}
                placeholder="e.g. Home Router, iPhone-Flash, Neighbor-Cam..."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,242,254,0.05)', border: '1px solid var(--accent-primary)',
                  borderRadius: '6px', padding: '0.75rem 1rem',
                  color: '#fff', fontSize: '0.95rem', fontFamily: 'inherit',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={closeLabelModal} className="tactical-btn" style={{ opacity: 0.6 }}><X size={14} /> CANCEL</button>
              <button onClick={saveLabel} disabled={labelSaving} className="tactical-btn" style={{ background: 'rgba(0,242,254,0.15)', borderColor: 'var(--accent-primary)' }}>
                {labelSaving ? 'SAVING...' : <><Check size={14} /> CONFIRM ALIAS</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="header-area glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Shield className="title-glow" size={36} />
          <div>
            <h1 className="title-glow" style={{ fontSize: '1.5rem', lineHeight: 1 }}>AEGIS COMMAND</h1>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span>UPLINK_STATUS:</span>
                <span style={{ 
                  color: uplinkStatus === 'ESTABLISHED' ? 'var(--accent-success)' : uplinkStatus === 'LINK_LOST' ? 'var(--accent-danger)' : 'var(--accent-warn)',
                  fontWeight: 'bold',
                  textShadow: uplinkStatus === 'ESTABLISHED' ? '0 0 5px var(--accent-success)' : 'none'
                }}>{uplinkStatus}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
             <span className="radar-pulse"></span>
             <span style={{ fontFamily: 'Chakra Petch', color: 'var(--accent-danger)', fontWeight: 'bold', letterSpacing: '0.1em' }}>LIVE MONITOR</span>
           </div>
          <span className="status-badge active" style={{ padding: '0.5rem 1rem' }}>ROOT / ADMIN</span>
          {/* Export Buttons */}
          <button onClick={() => downloadExport('json')} className="tactical-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', gap: '0.4rem' }}>
            <Download size={14} /> JSON
          </button>
          <button 
            onClick={exportTacticalData}
            disabled={exportLoading}
            className="tactical-btn" 
            style={{ background: 'rgba(0, 242, 254, 0.1)', borderColor: 'var(--accent-primary)', fontSize: '0.8rem' }}>
            <Download size={14} /> {exportLoading ? 'EXTRACTING...' : 'TACTICAL EXPORT'}
          </button>
          {/* Sound / Notif Toggles */}
          <button onClick={() => setSoundEnabled(s => !s)} className="tactical-btn" title={soundEnabled ? 'Disable Sound' : 'Enable Sound'} style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', opacity: soundEnabled ? 1 : 0.4 }}>
            {soundEnabled ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
          <button onClick={notifsEnabled ? () => setNotifsEnabled(false) : requestNotifPermission} className="tactical-btn" title={notifsEnabled ? 'Disable Notifications' : 'Enable Notifications'} style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', opacity: notifsEnabled ? 1 : 0.4 }}>
            <Siren size={14} />
          </button>
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside className="sidebar-area glass-panel" style={{ padding: '1.5rem 0.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', marginBottom: '1rem' }} className="custom-scrollbar">
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {[
              { icon: Activity, label: 'Dashboard Overview' },
              { icon: Wifi, label: 'Airspace Radar' },
              { icon: Crosshair, label: 'Live Signal Sweep' },
              { icon: Map, label: 'Topology Net Graph' },
              { icon: BarChart2, label: 'Spectrum Heatmap' },
              { icon: Search, label: 'Client Intercepts' },
              { icon: Zap, label: 'Handshake Capture' },
              { icon: History, label: 'Signal Intel' },
              { icon: Radio, label: 'Probe Timeline' },
              { icon: ShieldAlert, label: 'IDS Threat Board' },
              { icon: Users, label: 'Trusted Roster' },
              { icon: Skull, label: 'Offensive Ops' },
              { icon: Cpu, label: 'Aegis Intelligence' },
            ].map((item, idx) => {
              const isActive = activeTab === item.label;
              return (
                <li key={idx} 
                  onClick={() => setActiveTab(item.label)}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  style={{ padding: '0.75rem 1rem' }}>
                  <item.icon size={18} />
                  <span style={{ fontSize: '0.85rem' }}>{item.label}</span>
                </li>
              );
            })}
            <hr style={{ opacity: 0.1, margin: '1rem 0' }} />
            
            <li 
              className={activeTab === 'strategic' ? 'active' : ''} 
              onClick={() => setActiveTab('strategic')}
            >
              <div className="tab-indicator" />
              <span className="tab-icon">⚡</span>
              STRATEGIC COMMAND
              <span className="tab-badge pulse" style={{ background: '#f59e0b' }}>LVL 2</span>
            </li>

            <li 
              className={activeTab === 'dominance' ? 'active' : ''} 
              onClick={() => setActiveTab('dominance')}
            >
              <div className="tab-indicator" />
              <span className="tab-icon">🎯</span>
              AIRSPACE DOMINANCE
              <span className="tab-badge pulse" style={{ background: '#ef4444' }}>LVL 3</span>
            </li>
          </ul>
        </div>
        
        {/* Sub-system Status */}
        <div style={{ marginTop: 'auto', background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h4 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>MODULE STATUS</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>wlan0mon</span> <span style={{ color: 'var(--accent-success)' }}>UP</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>IDS Engine</span> <span style={{ color: 'var(--accent-success)' }}>ARMED</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Aireplay-ng</span> <span style={{ color: activeAttacks.length > 0 ? 'var(--accent-danger)' : 'var(--accent-secondary)' }}>{activeAttacks.length > 0 ? 'JAMMING' : 'IDLE'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0' }}>
        
        {activeTab === 'Airspace Radar' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wifi className="title-glow" /> 802.11 Access Points
              </h3>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <span className="status-badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }}>{uniqueAccessPoints.length} TARGETS DETECTED</span>
              </div>
            </div>
            
            {/* Grid of AP Cards */}
            <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0 }}>
              {/* Main AP List */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
                gap: '1.5rem', 
                flex: selectedBSSID ? '2' : '1',
                overflowY: 'auto',
                paddingRight: '0.5rem'
              }}>
                {uniqueAccessPoints.map((ap, i) => (
                  <APCard 
                    key={i} 
                    ap={ap} 
                    toggleDeauth={toggleDeauth} 
                    isSelected={selectedBSSID === ap.bssid}
                    onSelect={setSelectedBSSID}
                    isAttacking={activeAttacks.includes(ap.bssid)}
                    onLabel={openLabelModal}
                  />
                ))}
              </div>

              {/* Interrogation Panel */}
              {selectedBSSID && (
                <div className="glass-panel" style={{ 
                  flex: '1', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  padding: '1.5rem',
                  borderLeft: '2px solid var(--accent-primary)',
                  background: 'rgba(0,0,0,0.4)',
                  position: 'relative',
                  overflowY: 'auto'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                      <Search size={20} className="title-glow" /> TARGET INTERROGATION
                    </h3>
                    <button onClick={() => setSelectedBSSID(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button>
                  </div>
                  
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>PRIMARY BSSID</div>
                    <div style={{ fontSize: '1.2rem', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{selectedBSSID}</div>
                    {uniqueAccessPoints.find(ap => ap.bssid === selectedBSSID) ? (
                      <>
                        {uniqueAccessPoints.find(ap => ap.bssid === selectedBSSID)?.primary_name && (
                          <div style={{ fontSize: '1rem', color: 'var(--accent-primary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Tag size={14} /> {uniqueAccessPoints.find(ap => ap.bssid === selectedBSSID)?.primary_name}
                          </div>
                        )}
                        <div style={{ fontSize: '0.9rem', color: '#fff', marginTop: '0.2rem' }}>{uniqueAccessPoints.find(ap => ap.bssid === selectedBSSID)?.ssid}</div>
                        <button
                          onClick={() => {
                            const ap = uniqueAccessPoints.find(a => a.bssid === selectedBSSID);
                            if (ap) openLabelModal({ id: ap.bssid, currentLabel: ap.primary_name || '', type: 'AP', displayName: ap.ssid });
                          }}
                          className="tactical-btn"
                          style={{ marginTop: '0.75rem', padding: '0.3rem 0.75rem', fontSize: '0.7rem', opacity: 0.85 }}>
                          <Tag size={12} /> {uniqueAccessPoints.find(ap => ap.bssid === selectedBSSID)?.primary_name ? 'RELABEL TARGET' : 'LABEL TARGET'}
                        </button>
                      </>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--accent-danger)', marginTop: '0.4rem', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <AlertTriangle size={14} /> TARGET SIGNAL LOST
                      </div>
                    )}
                  </div>

                  <h4 style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
                    CONNECTED INTERCEPTS ({interrogationClients.length})
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {interrogationClients.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                        No associated traffic detected in this interval...
                      </div>
                    ) : (
                      interrogationClients.map((client, idx) => (
                        <div key={idx} className="glass-panel" style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', alignItems: 'flex-start' }}>
                            <div>
                              {client.primary_name && (
                                <div style={{ fontSize: '0.9rem', color: 'var(--accent-primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.15rem' }}>
                                  <Tag size={12} /> {client.primary_name}
                                </div>
                              )}
                              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: client.primary_name ? 'var(--text-muted)' : '#fff' }}>{client.mac_address}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--accent-warn)' }}>{client.signal_strength} dBm</span>
                              <button
                                onClick={() => openLabelModal({ id: client.mac_address, currentLabel: client.primary_name || '', type: 'CLIENT', displayName: client.vendor || client.mac_address })}
                                className="tactical-btn"
                                style={{ padding: '0.15rem 0.4rem', fontSize: '0.65rem', opacity: 0.75 }}>
                                <Tag size={10} /> {client.primary_name ? 'RELABEL' : 'LABEL'}
                              </button>
                            </div>
                          </div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.4rem', borderRadius: '3px', display: 'inline-block' }}>
                            {client.vendor || 'UNKNOWN_VENDOR'}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'Aegis Intelligence' && (
          <AegisAgent />
        )}

        {activeTab === 'Live Signal Sweep' && (
          <div className="glass-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative' }}>
            {/* Distance Markers Legend */}
            <div style={{ position: 'absolute', top: '2rem', left: '2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }} />
                <span>CENTER: -30 dBm (NEAR)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', border: '1px solid var(--accent-primary)' }} />
                <span>EDGE: -90 dBm (FAR)</span>
              </div>
            </div>

            <div style={{ 
              width: '100%', maxWidth: '600px', aspectRatio: '1', borderRadius: '50%', border: '4px double rgba(0,242,254,0.2)', 
              position: 'relative', overflow: 'hidden', background: '#020d1a',
              boxShadow: '0 0 50px rgba(0,242,254,0.05) inset'
            }}>
              {/* Radar Grid Lines */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', background: 'rgba(255,255,255,0.05)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', background: 'rgba(255,255,255,0.05)' }} />
              
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.03)', transform: 'scale(0.2)' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)', transform: 'scale(0.4)' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.07)', transform: 'scale(0.6)' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.09)', transform: 'scale(0.8)' }} />
              
              {/* Spinning sweep line with trailing gradient */}
              <style dangerouslySetInnerHTML={{__html: `
                @keyframes spinSweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes pingEffect { 
                  0% { transform: scale(1); opacity: 1; box-shadow: 0 0 10px var(--accent-primary); } 
                  50% { transform: scale(1.8); opacity: 0.5; box-shadow: 0 0 30px var(--accent-primary); }
                  100% { transform: scale(1); opacity: 1; box-shadow: 0 0 10px var(--accent-primary); } 
                }
              `}} />
              <div style={{ 
                position: 'absolute', top: '0', left: '50%', width: '50%', height: '50%', 
                background: 'conic-gradient(from 180deg at 0% 100%, transparent 0deg, rgba(0,242,254,0.4) 60deg, transparent 90deg)', 
                transformOrigin: 'bottom left', animation: 'spinSweep 6s linear infinite', zIndex: 5
              }} />

              {/* Targets */}
              {accessPoints.map((ap, i) => {
                const dbm = ap.signal_strength || -100;
                const distanceRatio = Math.max(0, Math.min(50, ((Math.abs(dbm) - 30) / 60) * 50)); 
                const angle = (parseInt(ap.bssid.replace(/:/g,''), 16) % 360);
                const rad = angle * Math.PI / 180;
                
                const top = 50 + distanceRatio * Math.sin(rad) + '%';
                const left = 50 + distanceRatio * Math.cos(rad) + '%';

                return (
                  <div key={i} 
                    onMouseEnter={() => setHoveredTarget(ap)}
                    onMouseLeave={() => setHoveredTarget(null)}
                    style={{ position: 'absolute', top, left, zIndex: 10, cursor: 'crosshair' }}>
                    
                    {/* The Target Point */}
                    <div style={{
                      width: '10px', height: '10px', background: 'var(--accent-primary)',
                      borderRadius: '50%', transform: 'translate(-50%, -50%)',
                      boxShadow: '0 0 10px var(--accent-primary)',
                      animation: 'pingEffect 6s ease-in-out infinite',
                      animationDelay: `${(angle / 360) * 6}s`
                    }} />
                    
                    <div style={{
                      position: 'absolute', top: '10px', left: '10px', whiteSpace: 'nowrap',
                      fontSize: '0.65rem', color: '#fff', background: 'rgba(0,0,0,0.6)',
                      padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--accent-primary)',
                      opacity: 0.8, pointerEvents: 'none', borderLeft: '3px solid var(--accent-primary)'
                    }}>
                      {ap.ssid.substring(0, 10)}{ap.ssid.length > 10 ? '..' : ''} | {dbm}
                    </div>
                  </div>
                );
              })}

              {/* Central Coordinate Marker */}
              <div style={{ 
                position: 'absolute', top: '50%', left: '50%', width: '30px', height: '30px',
                border: '1px solid var(--accent-primary)', transform: 'translate(-50%, -50%) rotate(45deg)',
                opacity: 0.5
              }} />
            </div>

            {/* Tactical Detail Overlay (Floating) */}
            {hoveredTarget && (
              <div className="glass-panel" style={{
                position: 'absolute', bottom: '2rem', right: '2rem', width: '250px',
                borderLeft: '4px solid var(--accent-primary)', zIndex: 100,
                padding: '1rem', background: 'rgba(2, 13, 26, 0.95)', backdropFilter: 'blur(10px)'
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', letterSpacing: '2px', marginBottom: '0.5rem' }}>TARGET_LOCKED</div>
                <div style={{ fontSize: '1.1rem', marginBottom: '0.8rem' }}>{hoveredTarget.ssid}</div>
                <div style={{ fontSize: '0.8rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ color: 'var(--text-muted)' }}>BSSID:</div>
                  <div style={{ fontFamily: 'monospace' }}>{hoveredTarget.bssid}</div>
                  <div style={{ color: 'var(--text-muted)' }}>CH:</div>
                  <div>{hoveredTarget.channel}</div>
                  <div style={{ color: 'var(--text-muted)' }}>SIG:</div>
                  <div style={{ color: hoveredTarget.signal_strength > -60 ? 'var(--accent-success)' : 'var(--accent-warn)' }}>{hoveredTarget.signal_strength} dBm</div>
                  <div style={{ color: 'var(--text-muted)' }}>ENC:</div>
                  <div style={{ fontSize: '0.7rem' }}>{hoveredTarget.encryption}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Topology Net Graph' && (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 10, background: 'rgba(0,0,0,0.6)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--accent-primary)', fontSize: '0.8rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--accent-primary)' }}>3D SIGNAL SPACE</div>
                <div style={{ color: 'var(--text-muted)' }}>Scroll to Zoom · Drag to Rotate</div>
            </div>
            <ForceGraph3D
              graphData={graphData}
              backgroundColor="rgba(0,0,0,0)"
              nodeAutoColorBy="group"
              nodeLabel={(node: any) => node.name}
              linkColor={(link: any) => link.color || 'rgba(0, 242, 254, 0.2)'}
              linkWidth={1.5}
              nodeRelSize={6}
              nodeOpacity={0.9}
              enableNodeDrag={true}
            />
          </div>
        )}

        {activeTab === 'Spectrum Heatmap' && (
          <div className="glass-panel" style={{ flex: 1 }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart2 className="title-glow" /> 2.4 / 5 GHz Congestion Profile
            </h3>
            <ResponsiveContainer width="100%" height={500}>
              <BarChart data={heatmapData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                <XAxis dataKey="channel" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} angle={-45} textAnchor="end" />
                <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} />
                <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '1px solid var(--accent-primary)' }} />
                <Bar dataKey="count" fill="url(#colorUv)" radius={[4, 4, 0, 0]}>
                  {heatmapData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.count > 3 ? 'var(--accent-danger)' : entry.count > 1 ? 'var(--accent-warn)' : 'var(--accent-success)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {activeTab === 'Client Intercepts' && (
          <div className="glass-panel" style={{ flex: 1 }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Search className="title-glow" /> Unassociated Client Probes
            </h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client Hardware / MAC</th>
                  <th>Probing For (SSID History)</th>
                </tr>
              </thead>
              <tbody>
                {wirelessClients.map((client, i) => (
                  <tr key={i} className="data-row">
                     <td>
                       {client.primary_name && (
                         <div style={{ fontSize: '0.95rem', color: 'var(--accent-primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                           <Tag size={13} /> {client.primary_name}
                         </div>
                       )}
                       <div style={{ fontFamily: 'monospace', color: client.primary_name ? 'var(--text-muted)' : 'var(--accent-secondary)', fontSize: '1.0rem' }}>{client.mac_address}</div>
                       <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                         {client.vendor || 'Unknown Vendor'}
                       </div>
                       <button
                         onClick={() => openLabelModal({ id: client.mac_address, currentLabel: client.primary_name || '', type: 'CLIENT', displayName: client.vendor || client.mac_address })}
                         className="tactical-btn"
                         style={{ marginTop: '0.4rem', padding: '0.2rem 0.5rem', fontSize: '0.65rem', opacity: 0.8 }}>
                         <Tag size={10} /> {client.primary_name ? 'RELABEL' : 'LABEL'}
                       </button>
                     </td>
                     <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {client.probed_ssids ? client.probed_ssids.split(',').filter(Boolean).map((s: string, j: number) => (
                          <span key={j} style={{ background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>{s}</span>
                        )) : <span style={{ color: 'var(--text-muted)' }}>Passive Client (No Probes)</span>}
                      </div>
                     </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'Handshake Capture' && (
          <div className="glass-panel" style={{ flex: 1 }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Lock className="title-glow" /> 802.1X INTERCEPT VAULT
            </h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Target BSSID</th>
                  <th>Victim MAC</th>
                  <th>EAPOL Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {handshakes.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No EAPOL handshakes captured yet. Deauth a target to force reconnection.</td></tr>
                ) : handshakes.map((hs, i) => (
                  <tr key={i} className="data-row">
                     <td style={{ fontFamily: 'monospace', color: 'var(--accent-secondary)' }}>{hs.bssid}</td>
                     <td style={{ fontFamily: 'monospace', color: 'var(--accent-warn)' }}>{hs.client_mac}</td>
                     <td>
                        <div>{hs.packet_count} packets captured</div>
                        {hs.converted_path && <div style={{ fontSize: '0.7rem', color: 'var(--accent-success)' }}>HASH READY: {hs.converted_path}</div>}
                     </td>
                     <td>
                        <button 
                          onClick={() => handleConvert(hs.id)}
                          className="tactical-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>
                          <Crosshair size={14} /> EXTRACT HASH
                        </button>
                     </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Global Dashboard Layout mixing components */}
        {activeTab === 'Dashboard Overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
             {/* Pulse Monitor */}
            <div className="glass-panel" style={{ height: '350px' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Radio className="title-glow" /> GLOBAL PACKET VELOCITY
              </h3>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={trafficData}>
                  <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '1px solid var(--border-active)' }} />
                  <Line type="monotone" dataKey="packets" stroke="var(--accent-primary)" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: 'var(--accent-primary)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Alert / Incident Log */}
            <div className="glass-panel" style={{ height: '350px', overflowY: 'auto', border: alerts.some(a => a.severity==='High') ? '1px solid rgba(255, 8, 68, 0.4)' : undefined }}>
              <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle className={alerts.some(a => a.severity==='High') ? 'radar-pulse' : 'title-glow'} style={{ color: alerts.some(a => a.severity==='High') ? 'var(--accent-danger)' : undefined }} /> 
                INCIDENT LOG
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {alerts.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Airspace Secure.</div>
                ) : alerts.slice(0, 15).map((alert, i) => (
                  <div key={i} className="alert-box" style={{ 
                    borderLeftColor: alert.severity === 'High' ? 'var(--accent-danger)' : alert.severity === 'Warning' ? 'var(--accent-warn)' : 'var(--accent-primary)',
                    padding: '0.75rem',
                    background: alert.severity === 'High' ? 'rgba(255,0,0,0.1)' : 'rgba(0,0,0,0.4)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: alert.severity === 'High' ? 'var(--accent-danger)' : undefined }}>{alert.severity.toUpperCase()} OCURRENCE</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#fff' }}>{alert.message}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Signal Intel Tab ───────────────────────────────────────────── */}
        {activeTab === 'Signal Intel' && (
          <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0 }}>
            {/* AP Selector */}
            <div className="glass-panel" style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto' }}>
              <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', letterSpacing: '0.1em' }}>SELECT ACCESS POINT</h4>
              {uniqueAccessPoints.map((ap, i) => (
                <div key={i} onClick={() => loadSignalHistory(ap.bssid)}
                  className="glass-panel"
                  style={{ padding: '0.75rem', cursor: 'pointer', border: signalHistoryBSSID === ap.bssid ? '1px solid var(--accent-primary)' : undefined, background: signalHistoryBSSID === ap.bssid ? 'rgba(0,242,254,0.07)' : undefined }}>
                  <div style={{ fontSize: '0.9rem', color: ap.primary_name ? 'var(--accent-primary)' : '#fff' }}>{ap.primary_name || ap.ssid}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ap.bssid}</div>
                </div>
              ))}
            </div>
            {/* Chart */}
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History className="title-glow" /> Signal Strength History
                {signalHistoryBSSID && <span style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', fontFamily: 'monospace', marginLeft: '0.5rem' }}>{signalHistoryBSSID}</span>}
              </h3>
              {signalHistory.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {signalHistoryBSSID ? 'No signal history recorded yet. Data accumulates every 5 seconds.' : 'Select an AP to view its signal history.'}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={signalHistory}>
                    <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} domain={[-100, -20]} />
                    <RechartsTooltip contentStyle={{ background: 'rgba(0,0,0,0.9)', border: '1px solid var(--accent-primary)' }} formatter={(v: any) => [`${v} dBm`, 'Signal']} />
                    <Line type="monotone" dataKey="signal" stroke="var(--accent-primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* ── Probe Timeline Tab ─────────────────────────────────────────── */}
        {activeTab === 'Probe Timeline' && (
          <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0 }}>
            {/* Client Selector */}
            <div className="glass-panel" style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto' }}>
              <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', letterSpacing: '0.1em' }}>SELECT CLIENT</h4>
              {wirelessClients.map((c, i) => (
                <div key={i} onClick={() => loadProbeHistory(c.mac_address)}
                  className="glass-panel"
                  style={{ padding: '0.75rem', cursor: 'pointer', border: probeHistoryMAC === c.mac_address ? '1px solid var(--accent-warn)' : undefined, background: probeHistoryMAC === c.mac_address ? 'rgba(255,193,7,0.07)' : undefined }}>
                  {c.primary_name && <div style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Tag size={11} /> {c.primary_name}</div>}
                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--accent-warn)' }}>{c.mac_address}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{c.vendor}</div>
                </div>
              ))}
            </div>
            {/* Timeline Feed */}
            <div className="glass-panel" style={{ flex: 1, overflowY: 'auto' }}>
              <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Radio className="title-glow" /> Probe Request History
                {probeHistoryMAC && <span style={{ fontSize: '0.75rem', color: 'var(--accent-warn)', fontFamily: 'monospace', marginLeft: '0.5rem' }}>{probeHistoryMAC}</span>}
              </h3>
              {probeHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {probeHistoryMAC ? 'No probe history recorded for this client.' : 'Select a client to view its probe request history.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {probeHistory.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', borderLeft: '2px solid var(--accent-warn)' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(p.timestamp).toLocaleTimeString()}</span>
                      <span style={{ color: '#fff', fontSize: '0.9rem', flex: 1 }}>{p.probed_ssid || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Wildcard / Broadcast</span>}</span>
                      <span style={{ fontSize: '0.75rem', color: p.signal_dbm > -60 ? 'var(--accent-success)' : 'var(--accent-warn)' }}>{p.signal_dbm} dBm</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── IDS Threat Board Tab ───────────────────────────────────────── */}
        {activeTab === 'IDS Threat Board' && (
          <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert className="title-glow" style={{ color: alerts.some(a => a.severity === 'Critical' || a.severity === 'High') ? 'var(--accent-danger)' : undefined }} />
                IDS THREAT BOARD
              </h3>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{alerts.length} EVENTS</span>
                <span className="status-badge" style={{ background: alerts.some(a => a.severity === 'Critical') ? 'rgba(255,0,64,0.3)' : 'rgba(255,255,255,0.05)', color: 'white' }}>
                  {alerts.some(a => a.severity === 'Critical') ? '🔴 CRITICAL' : alerts.some(a => a.severity === 'High') ? '🟠 HIGH' : '🟢 NORMAL'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', overflowY: 'auto' }}>
              {alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Airspace Secure. IDS standing by.</div>
              ) : alerts.map((alert, i) => {
                const isCrit = alert.severity === 'Critical';
                const isHigh = alert.severity === 'High';
                return (
                  <div key={i} style={{
                    padding: '0.9rem 1.2rem',
                    borderRadius: '6px',
                    borderLeft: `4px solid ${isCrit ? 'var(--accent-danger)' : isHigh ? '#ff6600' : 'var(--accent-primary)'}`,
                    background: isCrit ? 'rgba(255,0,64,0.12)' : isHigh ? 'rgba(255,102,0,0.08)' : 'rgba(0,0,0,0.4)',
                    display: 'flex', gap: '1rem', alignItems: 'flex-start'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.65rem', color: isCrit ? 'var(--accent-danger)' : isHigh ? '#ff6600' : 'var(--accent-primary)', letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        {alert.severity.toUpperCase()} — {new Date(alert.timestamp).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#fff' }}>{alert.message}</div>
                      {alert.device_mac && <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Source: {alert.device_mac}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Trusted Roster Tab ─────────────────────────────────────────── */}
        {activeTab === 'Trusted Roster' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
            {/* Add Form */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users className="title-glow" /> Add Trusted Device
              </h3>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <input value={whitelistInput} onChange={e => setWhitelistInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addToWhitelist()}
                  placeholder="MAC / BSSID  e.g. AA:BB:CC:DD:EE:FF"
                  style={{ flex: '2', minWidth: '220px', background: 'rgba(0,242,254,0.05)', border: '1px solid var(--accent-primary)', borderRadius: '6px', padding: '0.75rem 1rem', color: '#fff', fontSize: '0.9rem', fontFamily: 'monospace', outline: 'none' }} />
                <input value={whitelistLabel} onChange={e => setWhitelistLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addToWhitelist()}
                  placeholder="Label (optional)"
                  style={{ flex: '1', minWidth: '160px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.75rem 1rem', color: '#fff', fontSize: '0.9rem', outline: 'none' }} />
                <button onClick={addToWhitelist} className="tactical-btn" style={{ background: 'rgba(0,242,254,0.15)', borderColor: 'var(--accent-primary)' }}>
                  <Check size={16} /> AUTHORIZE
                </button>
              </div>
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                ⚠ When 1+ trusted devices exist, IDS will fire alerts for any <strong>unrecognized</strong> MAC that appears on the network.
              </div>
            </div>
            {/* Roster List */}
            <div className="glass-panel" style={{ flex: 1, overflowY: 'auto' }}>
              <h4 style={{ marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>AUTHORIZED DEVICES ({whitelist.length})</h4>
              {whitelist.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No trusted devices registered. IDS whitelist mode is inactive.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {whitelist.map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: 'rgba(0,255,100,0.05)', borderRadius: '6px', borderLeft: '3px solid var(--accent-success)' }}>
                      <Check size={16} style={{ color: 'var(--accent-success)', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'monospace', color: 'var(--accent-success)', fontSize: '0.9rem' }}>{t.mac_address}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{t.label || 'No label'} · Added {new Date(t.added_at).toLocaleDateString()}</div>
                      </div>
                      <button onClick={() => removeFromWhitelist(t.mac_address)} className="tactical-btn danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}>
                        <Trash2 size={12} /> REVOKE
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Offensive Ops Tab ──────────────────────────────────────────── */}
        {activeTab === 'Offensive Ops' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

              {/* Deauth Panel */}
              <div className="glass-panel" style={{ padding: '1.5rem', borderTop: '2px solid var(--accent-danger)' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-danger)' }}>
                  <Zap /> DEAUTH ENGINE
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Active Strikes: <span style={{ color: activeAttacks.length > 0 ? 'var(--accent-danger)' : 'var(--accent-success)', fontWeight: 'bold' }}>{activeAttacks.length > 0 ? activeAttacks.join(', ') : 'NONE'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                  {uniqueAccessPoints.map((ap, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', background: 'rgba(0,0,0,0.4)', borderRadius: '6px' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', color: activeAttacks.includes(ap.bssid) ? 'var(--accent-danger)' : '#fff' }}>{ap.primary_name || ap.ssid}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: 'var(--text-muted)' }}>CH{ap.channel} · {ap.bssid}</div>
                      </div>
                      <button onClick={() => toggleDeauth(ap.bssid)} className={`tactical-btn ${activeAttacks.includes(ap.bssid) ? 'warn' : 'danger'}`} style={{ padding: '0.3rem 0.7rem', fontSize: '0.7rem' }}>
                        <Zap size={12} /> {activeAttacks.includes(ap.bssid) ? 'HALT' : 'JAM'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evil Twin Panel */}
              <div className="glass-panel" style={{ padding: '1.5rem', borderTop: `2px solid ${evilTwinActive ? 'var(--accent-danger)' : 'var(--accent-warn)'}` }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-warn)' }}>
                  <Skull /> EVIL TWIN AP
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Clones a target AP's SSID to lure clients. Requires <code style={{ color: 'var(--accent-primary)' }}>hostapd</code>.
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>SELECT TARGET AP</label>
                  <select value={evilTwinTarget?.bssid || ''} onChange={e => setEvilTwinTarget(uniqueAccessPoints.find(a => a.bssid === e.target.value) || null)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.6rem', color: '#fff', outline: 'none', fontSize: '0.85rem' }}>
                    <option value="">-- SELECT AP TO CLONE --</option>
                    {uniqueAccessPoints.map(ap => <option key={ap.bssid} value={ap.bssid}>{ap.primary_name || ap.ssid} ({ap.bssid}) CH{ap.channel}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#fff' }}>KARMA MODE (PROBE SPOOF)</span>
                    <button onClick={() => setKarmaMode(!karmaMode)} style={{ background: karmaMode ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)', border: 'none', width: '30px', height: '16px', borderRadius: '10px', position: 'relative', cursor: 'pointer' }}>
                      <div style={{ width: '12px', height: '12px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: karmaMode ? '16px' : '2px', transition: 'all 0.2s' }} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#fff' }}>CAPTIVE PORTAL (REDIRECT)</span>
                    <button onClick={() => setCaptivePortal(!captivePortal)} style={{ background: captivePortal ? 'var(--accent-warn)' : 'rgba(255,255,255,0.1)', border: 'none', width: '30px', height: '16px', borderRadius: '10px', position: 'relative', cursor: 'pointer' }}>
                      <div style={{ width: '12px', height: '12px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: captivePortal ? '16px' : '2px', transition: 'all 0.2s' }} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  {evilTwinActive ? (
                    <button onClick={stopEvilTwin} className="tactical-btn warn" style={{ flex: 1 }}><X size={14} /> NEUTRALIZE TWIN</button>
                  ) : (
                    <button onClick={launchEvilTwin} disabled={!evilTwinTarget} className="tactical-btn danger" style={{ flex: 1, opacity: evilTwinTarget ? 1 : 0.4 }}><Skull size={14} /> DEPLOY TWIN</button>
                  )}
                </div>
                {evilTwinActive && <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--accent-danger)' }} className="radar-pulse">● TWIN BROADCASTING</div>}
              </div>

              {/* Beacon Flood Panel */}
              <div className="glass-panel" style={{ padding: '1.5rem', borderTop: `2px solid ${beaconFloodActive ? 'var(--accent-danger)' : 'var(--accent-secondary)'}` }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-secondary)' }}>
                  <Radio /> BEACON FLOOD
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Floods the airspace with random SSID beacons, disrupting scanning. Requires <code style={{ color: 'var(--accent-primary)' }}>mdk4</code>.
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>TARGET CHANNEL: <strong style={{ color: '#fff' }}>{beaconFloodChannel}</strong></label>
                  <input type="range" min={1} max={13} value={beaconFloodChannel} onChange={e => setBeaconFloodChannel(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-secondary)' }} />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  {beaconFloodActive ? (
                    <button onClick={stopBeaconFlood} className="tactical-btn warn" style={{ flex: 1 }}><X size={14} /> STOP FLOOD</button>
                  ) : (
                    <button onClick={launchBeaconFlood} className="tactical-btn" style={{ flex: 1, borderColor: 'var(--accent-secondary)', color: 'var(--accent-secondary)' }}><Radio size={14} /> FLOOD CH{beaconFloodChannel}</button>
                  )}
                </div>
                {beaconFloodActive && <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--accent-danger)' }} className="radar-pulse">● FLOODING ACTIVE</div>}
              </div>

              {/* Status Summary */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShieldAlert className="title-glow" /> OFFENSIVE STATUS</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                  {[
                    { label: 'Deauth Strikes', value: activeAttacks.length > 0 ? `ACTIVE (${activeAttacks.length})` : 'IDLE', color: activeAttacks.length > 0 ? 'var(--accent-danger)' : 'var(--accent-success)' },
                    { label: 'Evil Twin', value: evilTwinActive ? 'BROADCASTING' : 'OFFLINE', color: evilTwinActive ? 'var(--accent-danger)' : 'var(--text-muted)' },
                    { label: 'Beacon Flood', value: beaconFloodActive ? 'FLOODING' : 'OFFLINE', color: beaconFloodActive ? 'var(--accent-danger)' : 'var(--text-muted)' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ color, fontWeight: 'bold' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PHASE 2: STRATEGIC COMMAND ────────────────────────────────────── */}
        {activeTab === 'strategic' && (
          <div className="dashboard-grid fade-in">
            {/* Campaign Manager */}
            <div className="glass-panel" style={{ gridColumn: 'span 2' }}>
              <div className="panel-header">
                <h3>ADVERSARY EMULATION ENGINE (AEE)</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                         className="tactical-btn"
                         onClick={async () => {
                            if (!selectedBSSID) {
                                alert("SELECT TARGET BSSID FIRST");
                                return;
                            }
                            const name = prompt("CAMPAIGN NAME:", "Strategic_Operation_01");
                            if (name) {
                                await axios.post(`${API_BASE}/api/strategic/campaign/start?name=${name}&bssid=${selectedBSSID}`);
                                alert("CAMPAIGN INITIATED");
                                fetchFullState();
                            }
                         }}
                    >
                         INITIATE CAMPAIGN
                    </button>
                    <button className="tactical-btn" onClick={fetchFullState}>SYNC</button>
                </div>
              </div>
              <div className="scroll-area" style={{ maxHeight: '300px' }}>
                <table className="tactical-table">
                  <thead>
                    <tr>
                      <th>CAMPAIGN</th>
                      <th>TARGET</th>
                      <th>STATUS</th>
                      <th>PROGRESS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', opacity: 0.5 }}>NO CAMPAIGNS ACTIVE</td></tr>
                    ) : (
                      campaigns.map(c => (
                        <tr key={c.id}>
                          <td style={{ color: '#f59e0b', fontWeight: 'bold' }}>{c.name}</td>
                          <td className="mono">{c.target}</td>
                          <td>
                            <span className={`status-badge ${c.status.toLowerCase()}`}>{c.status}</span>
                          </td>
                          <td>
                             {c.steps.filter((s:any) => s.status === 'Success').length} / {c.steps.length} STEPS
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Compliance Stats */}
            <div className="glass-panel">
              <div className="panel-header">
                <h3>COMPLIANCE AUDITOR</h3>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '3rem', fontWeight: 'bold', color: (complianceReport?.score || 0) < 70 ? '#ef4444' : '#10b981' }}>
                  {complianceReport?.score || 100}%
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>TACTICAL READINESS SCORE</div>
              </div>
              <div className="scroll-area" style={{ maxHeight: '200px' }}>
                {complianceReport?.findings.map((f: any, i: number) => (
                  <div key={i} style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 'bold' }}>{f.standard}</span>
                        <span style={{ color: f.status === 'PASS' ? '#10b981' : '#ef4444' }}>{f.status}</span>
                     </div>
                     <p style={{ margin: '0.2rem 0', fontSize: '0.8rem', opacity: 0.8 }}>{f.finding}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Forensics Lab */}
            <div className="glass-panel" style={{ gridColumn: 'span 3' }}>
              <div className="panel-header">
                <h3>FORENSICS LAB (INCIDENT REPORTS)</h3>
              </div>
              <div className="scroll-area" style={{ maxHeight: '400px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', padding: '1rem' }}>
                  {forensicIncidents.length === 0 ? (
                    <div style={{ textAlign: 'center', opacity: 0.5, gridColumn: '1/-1' }}>NO INCIDENTS ANALYZED</div>
                  ) : (
                    forensicIncidents.map(inc => (
                      <div key={inc.id} className="glass-panel" style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                           <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{inc.title}</span>
                           <span className="status-badge high">{inc.severity}</span>
                        </div>
                        <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>{inc.summary}</p>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                          TIMELINE: {new Date(inc.timestamp).toLocaleString()}
                        </div>
                        <button className="tactical-btn" style={{ marginTop: '1rem', width: '100%' }}>EXECUTE DEEP DIVE (TSHARK)</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PHASE 3: AIRSPACE DOMINANCE ────────────────────────────────────── */}
        {activeTab === 'dominance' && (
          <div className="dashboard-grid fade-in">
            {/* Live Interception Feed */}
            <div className="glass-panel" style={{ gridColumn: 'span 2' }}>
              <div className="panel-header">
                <h3>LIVE DOMINANCE FEED (INTERCEPTED TELEMETRY)</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="tactical-btn" onClick={() => axios.post(`${API_BASE}/api/dominance/start?interface=at0`)}>START LIVE MONITOR (AT0)</button>
                    <button className="tactical-btn shadow" onClick={fetchFullState}>REFRESH</button>
                </div>
              </div>
              <div className="scroll-area dominance-feed" style={{ maxHeight: '500px', padding: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {interceptedTraffic.length === 0 ? (
                  <div className="empty-state">WAITING FOR HIJACKED TELEMETRY...</div>
                ) : (
                  interceptedTraffic.map((t, i) => (
                    <div key={i} className={`feed-entry ${t.severity === 'High' ? 'critical' : ''}`} style={{ marginBottom: '0.8rem', padding: '0.5rem', borderLeft: `3px solid ${t.severity === 'High' ? '#ef4444' : '#f59e0b'}`, background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.2rem' }}>
                        <span>{new Date(t.timestamp).toLocaleTimeString()}</span>
                        <span>{t.client_mac} ({t.client_ip})</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 'bold', color: t.gravity === 'High' ? '#ef4444' : '#10b981' }}>[{t.traffic_type}] {t.host}</span>
                        <span style={{ fontStyle: 'italic', fontSize: '0.8rem', opacity: 0.8 }}>{t.content}</span>
                      </div>
                      {t.severity === 'High' && (
                          <div style={{ color: '#ef4444', fontSize: '0.7rem', fontWeight: 'bold', marginTop: '0.2rem' }}>[!] STRATEGIC RISK DETECTED</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Hijack Console */}
            <div className="glass-panel">
              <div className="panel-header">
                <h3>HIJACK CONSOLE</h3>
              </div>
              
              {/* ARP Spoof */}
              <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '0.7rem', opacity: 0.6, letterSpacing: '0.1rem', marginBottom: '0.5rem' }}>ARP REDIRECTION (MITM)</div>
                <input id="arpTarget" type="text" placeholder="TARGET IP (e.g. 10.0.0.100)" className="tactical-input" style={{ width: '100%', marginBottom: '0.5rem' }} />
                <input id="arpGateway" type="text" placeholder="GATEWAY IP (e.g. 10.0.0.1)" className="tactical-input" style={{ width: '100%', marginBottom: '0.5rem' }} />
                 <button 
                         className="tactical-btn" 
                         style={{ width: '100%', background: '#ef4444' }}
                         onClick={async () => {
                             const target = (document.getElementById('arpTarget') as HTMLInputElement).value;
                             const gw = (document.getElementById('arpGateway') as HTMLInputElement).value;
                             const res = await axios.post(`${API_BASE}/api/dominance/hijack/arp?target_ip=${target}&gateway_ip=${gw}`);
                             alert(res.data.message || res.data.error);
                         }}
                 >
                    INITIATE ARP SPOOF
                 </button>
              </div>

              {/* DNS Hijack */}
              <div style={{ padding: '1rem' }}>
                <div style={{ fontSize: '0.7rem', opacity: 0.6, letterSpacing: '0.1rem', marginBottom: '0.5rem' }}>DNS DOMAIN REDIRECTION</div>
                <input id="dnsDomain" type="text" placeholder="DOMAIN (e.g. google.com)" className="tactical-input" style={{ width: '100%', marginBottom: '0.5rem' }} />
                <input id="dnsRedirect" type="text" placeholder="REDIRECT TO (e.g. 10.0.0.1)" className="tactical-input" style={{ width: '100%', marginBottom: '0.5rem' }} />
                 <button 
                         className="tactical-btn" 
                         style={{ width: '100%', background: '#f59e0b' }}
                         onClick={async () => {
                             const domain = (document.getElementById('dnsDomain') as HTMLInputElement).value;
                             const redirect = (document.getElementById('dnsRedirect') as HTMLInputElement).value;
                             const res = await axios.post(`${API_BASE}/api/dominance/hijack/dns?domain=${domain}&redirect_ip=${redirect}`);
                             alert(res.data.message || res.data.error);
                         }}
                 >
                    STAGE DNS HIJACK
                 </button>
              </div>
            </div>

            {/* Pattern Settings */}
            <div className="glass-panel" style={{ gridColumn: 'span 3' }}>
              <div className="panel-header"><h3>TACTICAL MONITORING PARAMETERS</h3></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', padding: '1.5rem' }}>
                 <div>
                    <h4 style={{ color: '#10b981', marginBottom: '0.5rem' }}>LIVE DECRYPTION</h4>
                    <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>WPA2-PSK Handshakes verified: 4. Real-time decryption engine active for monitored APs.</p>
                 </div>
                 <div>
                    <h4 style={{ color: '#f59e0b', marginBottom: '0.5rem' }}>TYPO-SQUATTING</h4>
                    <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Detection sensitivity: High. Monitoring for 120 common financial and social domain variants.</p>
                 </div>
                 <div>
                    <h4 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>TRAFFIC HEURISTICS</h4>
                    <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Beacon density: NORMAL. Unusual ARP activity: NONE. Encrypted/Open ratio: 12:5.</p>
                 </div>
              </div>
            </div>
          </div>
        )}
      </main>

    </div>
  );
}
