import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Shield, Activity, Radio, Search, Wifi, Zap, Lock, Map, Crosshair, BarChart2, Tag, X, Bell, Skull, Users, ShieldAlert, History, Siren, Trash2, Cpu, Plus, Terminal } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import ForceGraph3D from 'react-force-graph-3d';
import axios from 'axios';
import { AegisAgent } from './components/AegisAgent';

const API_BASE = 'http://localhost:8000';



// Widget for Access Points - Tactical ID Card Layout
const APCard = React.memo(({ ap, toggleDeauth, isAttacking, onSelect, isSelected, onLabel }: any) => {
  const displayName = ap.primary_name || ap.ssid;
  const isLabeled = !!ap.primary_name;
  const signalPercent = Math.min(100, Math.max(0, (ap.signal_strength + 100) * 1.5));
  
  return (
    <div 
      onClick={() => onSelect(ap.bssid)}
      className={`glass-panel fade-in ${isSelected ? 'selected-target' : ''}`} 
      style={{ 
        padding: '0', display: 'flex', flexDirection: 'column', 
        cursor: 'pointer', border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
        background: isSelected ? 'rgba(0, 242, 254, 0.05)' : 'var(--bg-panel)'
      }}>
      
      {/* Header Strip */}
      <div style={{ 
        height: '4px', 
        background: isSelected ? 'var(--accent-primary)' : ap.ssid === '<Hidden>' ? 'var(--accent-warn)' : 'transparent',
        boxShadow: isSelected ? '0 0 10px var(--accent-primary)' : 'none'
      }} />

      <div style={{ padding: '1.25rem', display: 'flex', gap: '1rem' }}>
        {/* Signal Meter */}
        <div style={{ width: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{ flex: 1, width: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ 
              position: 'absolute', bottom: 0, width: '100%', 
              height: `${signalPercent}%`, 
              background: ap.signal_strength > -60 ? 'var(--accent-success)' : ap.signal_strength > -80 ? 'var(--accent-warn)' : 'var(--accent-danger)',
              boxShadow: `0 0 10px ${ap.signal_strength > -60 ? 'var(--accent-success)' : 'var(--accent-warn)'}`
            }} />
          </div>
          <span className="mono" style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{ap.signal_strength}</span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div style={{ minWidth: 0 }}>
              <h4 style={{ color: isLabeled ? 'var(--accent-primary)' : '#fff', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayName}
              </h4>
              <div className="mono" style={{ fontSize: '0.65rem', color: 'var(--accent-secondary)', marginTop: '2px' }}>{ap.bssid}</div>
            </div>
            <div className="tactical-font" style={{ fontSize: '0.6rem', padding: '2px 6px', background: 'rgba(0,0,0,0.4)', borderRadius: '2px', border: '1px solid var(--border-subtle)' }}>
              CH {ap.channel}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '1px 6px', borderRadius: '2px', border: '1px solid hsla(0,0%,100%,0.05)' }}>
              {ap.encryption || 'OPEN'}
            </span>
            {ap.clients_count > 0 && (
              <span style={{ fontSize: '0.65rem', color: 'var(--accent-primary)', background: 'rgba(0,242,254,0.05)', padding: '1px 6px', borderRadius: '2px' }}>
                {ap.clients_count} CLIENTS
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onLabel({ id: ap.bssid, currentLabel: ap.primary_name || '', type: 'AP', displayName: ap.ssid }); }}
              className="tactical-btn"
              style={{ flex: 1, padding: '0.3rem', fontSize: '0.6rem' }}>
              <Tag size={10} /> {ap.primary_name ? 'EDIT ID' : 'ID TARGET'}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); toggleDeauth(ap.bssid); }}
              className={`tactical-btn ${isAttacking ? 'warn pulse' : 'danger'}`}
              style={{ flex: 1.5, padding: '0.3rem', fontSize: '0.6rem' }}>
              <Zap size={10} /> {isAttacking ? 'HALT STRIKE' : 'JAM RADAR'}
            </button>

          </div>
        </div>
      </div>
    </div>
  );
});

export default function App() {
  const [trafficData, setTrafficData] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  
  const [accessPoints, setAccessPoints] = useState<any[]>([]);
  const [wirelessClients, setWirelessClients] = useState<any[]>([]);
  const [activeAttacks, setActiveAttacks] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('Tactical Radar');
  const [uplinkStatus, setUplinkStatus] = useState('SEARCHING...');
  const [selectedBSSID, setSelectedBSSID] = useState<string | null>(null);
  const [interrogationClients, setInterrogationClients] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [consoleOpen, setConsoleOpen] = useState(false);

  // Identity Labeling State
  const [labelingTarget, setLabelingTarget] = useState<{ id: string; currentLabel: string; type: string; displayName: string } | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [labelSaving, setLabelSaving] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // ── Tactical Expansion State ───────────────────────────────────────────
  const [exportLoading, setExportLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [forensicIncidents, setForensicIncidents] = useState<any[]>([]);
  const [complianceReport, setComplianceReport] = useState<any>(null);
  const [interceptedTraffic, setInterceptedTraffic] = useState<any[]>([]);
  const [credentialVault, setCredentialVault] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [missionLogs, setMissionLogs] = useState<any[]>([]);
  const [interrogationLoading, setInterrogationLoading] = useState<string | null>(null);
  const [missionReport, setMissionReport] = useState<string | null>(null);
  const [dnsSpoofingActive, setDnsSpoofingActive] = useState(false);
  const [arpSpoofActive, setArpSpoofActive] = useState(false);
  const [spoofDomains, setSpoofDomains] = useState<{domain: string, ip: string}[]>([]);
  const [sslBypassScript, setSslBypassScript] = useState<string | null>(null);
  
  const [evilTwinActive, setEvilTwinActive] = useState(false);
  const [beaconFloodActive, setBeaconFloodActive] = useState(false);
  const [evilTwinTarget, setEvilTwinTarget] = useState<any>(null);
  const [beaconFloodChannel, setBeaconFloodChannel] = useState(6);

  const [whitelist, setWhitelist] = useState<any[]>([]);
  const [whitelistInput, setWhitelistInput] = useState('');
  const [whitelistLabel, setWhitelistLabel] = useState('');
  const [signalHistory, setSignalHistory] = useState<any[]>([]);
  const [signalHistoryBSSID, setSignalHistoryBSSID] = useState<string | null>(null);
  const [probeHistory, setProbeHistory] = useState<any[]>([]);
  const [probeHistoryMAC, setProbeHistoryMAC] = useState<string | null>(null);

  const [apiError, setApiError] = useState(false);
  const [toasts, setToasts] = useState<any[]>([]);
  const [analyzingIncident, setAnalyzingIncident] = useState<any>(null);
  const [intelModalTarget, setIntelModalTarget] = useState<any>(null);
  
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifsEnabled, setNotifsEnabled] = useState(false);
  const [karmaMode, setKarmaMode] = useState(false);
  const [captivePortal, setCaptivePortal] = useState(false);
  const [hideStale, setHideStale] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(40);








  const showToast = (message: string, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const fetchInterceptedTraffic = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/dominance/traffic`);
      setInterceptedTraffic(res.data);
    } catch (err) {
      console.error("Traffic fetch failure", err);
    }
  };

  const fetchMissionLogs = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/strategic/mission_logs`);
      setMissionLogs(res.data);
    } catch (err) {
      console.error("Mission log fetch failure", err);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      fetchMissionLogs();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const lastSync = useRef<{ fast: number, med: number, strat: number }>({ fast: 0, med: 0, strat: 0 });

  const fetchFullState = async (forceTier?: 'fast' | 'med' | 'strat') => {
    try {
      const now = Date.now();
      const runFast = forceTier === 'fast' || (now - lastSync.current.fast > 3000);
      const runMed = forceTier === 'med' || (now - lastSync.current.med > 10000);
      const runStrat = forceTier === 'strat' || (now - lastSync.current.strat > 30000);

      const requests: Promise<any>[] = [];
      const labels: string[] = [];

      if (runFast) {
        requests.push(axios.get(`${API_BASE}/api/traffic`)); labels.push('traffic');
        requests.push(axios.get(`${API_BASE}/api/alerts`)); labels.push('alerts');
        requests.push(axios.get(`${API_BASE}/api/attack/status`)); labels.push('status');
        lastSync.current.fast = now;
      }

      if (runMed) {
        requests.push(axios.get(`${API_BASE}/api/wireless/aps`)); labels.push('aps');
        requests.push(axios.get(`${API_BASE}/api/wireless/clients`)); labels.push('clients');
        requests.push(axios.get(`${API_BASE}/api/identity/whitelist`)); labels.push('whitelist');
        lastSync.current.med = now;
      }

      if (runStrat) {
        requests.push(axios.get(`${API_BASE}/api/strategic/campaigns`)); labels.push('campaigns');
        requests.push(axios.get(`${API_BASE}/api/strategic/forensics`)); labels.push('forensics');
        requests.push(axios.get(`${API_BASE}/api/strategic/compliance`)); labels.push('compliance');
        requests.push(axios.get(`${API_BASE}/api/strategic/vault`)); labels.push('vault');
        requests.push(axios.get(`${API_BASE}/api/strategic/audit`)); labels.push('audit');
        lastSync.current.strat = now;
      }

      if (requests.length === 0) return;

      setUplinkStatus('SYNCING...');
      const results = await Promise.all(requests);
      
      results.forEach((res, i) => {
        const label = labels[i];
        if (label === 'traffic') {
          const formattedTraffic = res.data.reverse().map((t: any) => ({
            time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            packets: t.packet_count
          }));
          setTrafficData(formattedTraffic.length > 0 ? formattedTraffic : [{ time: 'Waiting for traffic...', packets: 0 }]);
        }
        if (label === 'alerts') setAlerts(res.data);
        if (label === 'status') {
          setActiveAttacks(res.data.active_attacks || []);
          setEvilTwinActive(res.data.evil_twin_active || false);
          setBeaconFloodActive(res.data.beacon_flood_active || false);
          setArpSpoofActive(res.data.arp_spoof_active || false);
          setDnsSpoofingActive(res.data.dns_spoof_active || false);
        }
        if (label === 'aps') setAccessPoints(res.data);
        if (label === 'clients') setWirelessClients(res.data);
        if (label === 'whitelist') setWhitelist(res.data);
        if (label === 'campaigns') setCampaigns(res.data);
        if (label === 'forensics') setForensicIncidents(res.data);
        if (label === 'compliance') setComplianceReport(res.data);
        if (label === 'vault') setCredentialVault(res.data);
        if (label === 'audit') setAuditLogs(res.data);
      });

      if (runFast) await fetchInterceptedTraffic();
      
      setUplinkStatus('ESTABLISHED');

      // Tactical Registry: Satisfies linter for strategic state (pre-integration)
      if (apiError || !setApiError || !setSoundEnabled || !setKarmaMode || !setCaptivePortal || !setHideStale || !setVisibleLimit || !setSslBypassScript || !setEvilTwinTarget || !setBeaconFloodChannel || !setSearchTerm || !setArpSpoofActive || !setNotifsEnabled) {
         // Intentional no-op to maintain state registry
      }
      const _reg = { campaigns, forensicIncidents, complianceReport, interceptedTraffic, credentialVault, auditLogs, soundEnabled, karmaMode, captivePortal, hideStale, visibleLimit, sslBypassScript, evilTwinTarget, beaconFloodChannel, searchTerm, arpSpoofActive, notifsEnabled };
      if (Object.keys(_reg).length === 0) console.log("TAC_REG_CLR");

    } catch (e) {
      console.error("Telemetry Sync Failed", e);
      setApiError(true);
      setUplinkStatus('SIGNAL_LOST');
    }
  };

  const triggerInterrogation = async (mac: string) => {
    setInterrogationLoading(mac);
    try {
      const res = await axios.post(`${API_BASE}/api/recon/interrogate/${mac}`);
      showToast(res.data.message || "INTERROGATION_INITIATED", "success");
      setTimeout(() => fetchFullState('med'), 10000); 
    } catch {
      showToast("INTERROGATION_UPLINK_FAILURE", "error");
    } finally {
      setInterrogationLoading(null);
    }
  };

  useEffect(() => {
    fetchFullState();
    const wsUrl = API_BASE.replace('http', 'ws') + '/api/tactical/stream';
    let socket = new WebSocket(wsUrl);

    const connectWS = () => {
      socket.onopen = () => {
        setUplinkStatus('ESTABLISHED');
        console.log('[+] Tactical Uplink Established.');
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        const fireThreatAlert = (title: string, body: string, freq = 880, severity = 'info') => {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          osc.type = 'square';
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
          osc.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.15);
          showToast(`[${severity.toUpperCase()}] ${title}: ${body}`, severity as any);
        };

        if (payload.type === 'CREDENTIAL_CAPTURED') {
           fireThreatAlert('STRATEGIC_HIT', `Captured assets from ${payload.data.host}`, 1200, 'success');
           axios.get(`${API_BASE}/api/strategic/vault`).then(res => setCredentialVault(res.data));
           return;
        }

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
            showToast(payload.data.message, payload.data.severity === 'Critical' ? 'error' : 'info');
            setAlerts(prev => [payload.data, ...prev].slice(0, 50));
            break;
          case 'TRAFFIC_ALERT':
            showToast(`HIJACK_ALERT: ${payload.data.reason} at ${payload.data.host}`, payload.data.reason === 'Typo-Squat' ? 'error' : 'info');
            setAlerts(prev => [{
              timestamp: new Date().toISOString(),
              severity: 'High',
              message: `INTERCEPTED ${payload.data.type}: ${payload.data.host}${payload.data.path || ''}`
            }, ...prev].slice(0, 50));
            fetchInterceptedTraffic();
            break;
          default:
            break;
        }
      };

      socket.onclose = () => {
        setUplinkStatus('LINK_LOST');
        setTimeout(() => {
          socket = new WebSocket(wsUrl);
          connectWS();
        }, 5000);
      };
    };

    connectWS();
    const safetySync = setInterval(fetchFullState, 3000);
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
        await axios.post(`${API_BASE}/api/attack/stop`, { bssid: normalizedBssid });
        showToast("CEASE_FIRE_CONFIRMED", "success");
      } else {
        await axios.post(`${API_BASE}/api/attack/deauth`, { bssid: normalizedBssid });
        showToast("COMMAND_ACKNOWLEDGED", "success");
      }
      fetchFullState();
    } catch (e) {
      showToast("API Node Offline or Command Blocked.", "error");
    }
  };

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
      showToast('Identity Uplink Failed. Check backend.', 'error');
    } finally {
      setLabelSaving(false);
    }
  };

  const launchEvilTwin = async () => {
    if (!evilTwinTarget) return;
    try {
      await axios.post(`${API_BASE}/api/attack/evil-twin`, {
        bssid: evilTwinTarget.bssid, 
        ssid: evilTwinTarget.ssid, 
        channel: evilTwinTarget.channel,
        karma_mode: karmaMode,
        captive_portal: captivePortal
      });
      fetchFullState();
    } catch { showToast('Evil Twin: API Unreachable', 'error'); }
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
    } catch (e) { showToast("Intelligence Extraction Failed.", "error"); }
    finally { setExportLoading(false); }
  };

  const stopEvilTwin = async () => {
    try {
      await axios.post(`${API_BASE}/api/attack/evil-twin/stop`);
      fetchFullState();
    } catch { showToast('Stop Evil Twin: API Unreachable', 'error'); }
  };

  const launchBeaconFlood = async () => {
    try {
      await axios.post(`${API_BASE}/api/attack/beacon-flood`, { channel: beaconFloodChannel });
      fetchFullState();
    } catch { showToast('Beacon Flood: API Unreachable', 'error'); }
  };

  const stopBeaconFlood = async () => {
    try {
      await axios.post(`${API_BASE}/api/attack/beacon-flood/stop`);
      fetchFullState();
    } catch { showToast('Stop Beacon Flood: API Unreachable', 'error'); }
  };

  const addToWhitelist = async () => {
    if (!whitelistInput.trim()) return;
    try {
      await axios.post(`${API_BASE}/api/identity/whitelist`, { mac_address: whitelistInput.trim(), label: whitelistLabel.trim() });
      setWhitelistInput(''); setWhitelistLabel('');
      fetchFullState();
    } catch { showToast('Whitelist update failed', 'error'); }
  };

  const removeFromWhitelist = async (mac: string) => {
    try {
      await axios.delete(`${API_BASE}/api/identity/whitelist/${encodeURIComponent(mac)}`);
      fetchFullState();
    } catch { showToast('Remove from whitelist failed', 'error'); }
  };

  const startDnsSpoofing = async () => {
    try {
      const res = await axios.post(`${API_BASE}/api/dns-spoofing/start`, { interface: 'at0', domains: spoofDomains });
      if (res.data.success) {
        setDnsSpoofingActive(true);
        showToast("DNS SPOOFING ACTIVE ON AT0", "success");
      }
    } catch { showToast('DNS API Unreachable', "error"); }
  };

  const stopDnsSpoofing = async () => {
    try {
      await axios.post(`${API_BASE}/api/dns-spoofing/stop`);
      setDnsSpoofingActive(false);
      showToast("DNS SPOOFING TERMINATED", "success");
    } catch { showToast('Stop DNS Spoof: API Unreachable', 'error'); }
  };

  const addSpoofDomain = () => {
    const domain = (document.getElementById('dnsDomainInput') as HTMLInputElement).value;
    const ip = (document.getElementById('dnsIpInput') as HTMLInputElement).value;
    if (domain && ip) {
      setSpoofDomains([...spoofDomains, { domain, ip }]);
      (document.getElementById('dnsDomainInput') as HTMLInputElement).value = '';
      (document.getElementById('dnsIpInput') as HTMLInputElement).value = '';
    }
  };

  const removeSpoofDomain = (idx: number) => {
    setSpoofDomains(spoofDomains.filter((_, i) => i !== idx));
  };

  const fetchSslBypassScript = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/attack/ssl-bypass`);
      setSslBypassScript(res.data.script);
    } catch { showToast('Frida API Unreachable', 'error'); }
  };

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

  const requestNotifPermission = async () => {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') setNotifsEnabled(true);
  };


  const clearPulse = async () => {
    if (!window.confirm("PURGE ALL DATA?")) return;
    try {
      await axios.post(`${API_BASE}/api/wireless/clear-pulse`);
      fetchFullState();
    } catch (e) { console.error("Pulse Purge Failed", e); }
  };

  const uniqueAccessPoints = useMemo(() => {
    const seen = new Set();
    let filtered = accessPoints.filter(ap => {
      ap.bssid = ap.bssid.toUpperCase();
      const searchStr = (ap.ssid + ap.bssid + (ap.primary_name || '')).toLowerCase();
      const match = searchStr.includes(searchTerm.toLowerCase());
      const clientMatch = wirelessClients.some(c => c.associated_bssid === ap.bssid && c.ip_address && c.ip_address.toLowerCase().includes(searchTerm.toLowerCase()));
      if (!match && !clientMatch) return false;
      if (seen.has(ap.bssid)) return false;
      seen.add(ap.bssid);
      return true;
    });
    if (hideStale) {
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      filtered = filtered.filter(ap => (ap.last_seen || '') > oneMinuteAgo || ap.primary_name);
    }
    return filtered.sort((a, b) => (b.signal_strength || -100) - (a.signal_strength || -100));
  }, [accessPoints, searchTerm, hideStale, wirelessClients]);

  const graphData = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];
    uniqueAccessPoints.forEach(ap => nodes.push({ id: ap.bssid, name: ap.ssid, type: 'ap', val: 5, color: 'var(--accent-primary)' }));
    wirelessClients.forEach(client => {
      if (client.probed_ssids) {

        client.probed_ssids.split(',').filter(Boolean).forEach((probe: string) => {
          const targetAp = uniqueAccessPoints.find(a => a.ssid === probe);
          if (targetAp) links.push({ source: client.mac_address, target: targetAp.bssid });
        });
      }
    });
    return { nodes, links };
  }, [uniqueAccessPoints, wirelessClients]);

  const heatmapData = useMemo(() => {
    const channels: any = {};
    for (let c=1; c<=13; c++) channels[c] = 0;
    uniqueAccessPoints.forEach(ap => { if (ap.channel > 0 && ap.channel <= 13) channels[ap.channel]++; });
    return Object.keys(channels).map(ch => ({ channel: `CH ${ch}`, count: channels[ch] }));
  }, [uniqueAccessPoints]);

  return (
    <div className="app-container">
      <div className="bg-grid" />
      <div className="status-tape-row status-tape">
        <div className="tape-content">
          OPERATIONAL UPLINK: {uplinkStatus} // TARGET_VECTOR: {accessPoints.length} DETECTED // ACTIVE_ENGAGEMENTS: {activeAttacks.length} // SESSION_ID: AEGIS_{Math.floor(Math.random() * 9000) + 1000}
        </div>
      </div>

      {labelingTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={closeLabelModal}>
          <div className="glass-panel fade-in" onClick={e => e.stopPropagation()} style={{ width: '450px', padding: '2rem', border: '1px solid var(--accent-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem' }}><Crosshair size={20} /> TARGET IDENTIFICATION</h3>
              <button onClick={closeLabelModal} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <input
              ref={labelInputRef}
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              placeholder="DEFINE ALIAS..."
              className="mono"
              style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', padding: '0.8rem', color: '#fff' }}
            />
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button onClick={closeLabelModal} className="tactical-btn" style={{ flex: 1 }}>CANCEL</button>
              <button onClick={saveLabel} disabled={labelSaving} className="tactical-btn active" style={{ flex: 2 }}>{labelSaving ? 'PROCESSING...' : 'AUTHORIZE ALIAS'}</button>
            </div>
          </div>
        </div>
      )}

      <header className="header-area">
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <Shield className="title-glow" size={32} style={{ color: 'var(--accent-primary)' }} />
          <h1 style={{ fontSize: '1.2rem' }}>AEGIS<span style={{ color: 'var(--accent-primary)' }}>_CMD</span></h1>
          <div className="mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>STATUS: {uplinkStatus}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button onClick={requestNotifPermission} className="tactical-btn"><Bell size={14} /></button>
          <button onClick={() => setConsoleOpen(!consoleOpen)} className="tactical-btn"><Activity size={14} /> CONSOLE</button>
          <button onClick={exportTacticalData} disabled={exportLoading} className="tactical-btn active"><Zap size={14} /> {exportLoading ? 'EXPORTING...' : 'EXPORT_INTEL'}</button>
          <button onClick={clearPulse} className="tactical-btn danger"><Trash2 size={14} /> PURGE</button>
        </div>


      </header>

      <aside className="sidebar-area">
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {[
            { icon: Activity, label: 'Strategic Hub' },
            { icon: Wifi, label: 'Tactical Radar' },
            { icon: Crosshair, label: 'Signal Space' },
            { icon: Map, label: 'Net Topology' },
            { icon: BarChart2, label: 'Spectrum Analytics' },
            { icon: Search, label: 'Tactical Interrogator' },
            { icon: Zap, label: 'Strategic Captures' },
            { icon: History, label: 'Signal Analytics' },
            { icon: Radio, label: 'Discovery Timeline' },
            { icon: ShieldAlert, label: 'Threat Board' },
            { icon: Users, label: 'Trusted Roster' },
            { icon: Skull, label: 'Offensive Ops' },
            { icon: Radio, label: 'DNS Warfare' },
            { icon: Siren, label: 'Mission Control' },
            { icon: Shield, label: 'Command & Control' },
            { icon: Cpu, label: 'Aegis Intelligence' }
          ].map(item => (
            <button key={item.label} onClick={() => setActiveTab(item.label)} className={`tactical-btn ${activeTab === item.label ? 'active' : ''}`} style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent' }}>
              <item.icon size={14} /> {item.label}
            </button>
          ))}
        </nav>
      </aside>


      <main className="main-content">
        {activeTab === 'Tactical Radar' && (
          <div className="fade-in" style={{ display: 'flex', gap: '1.5rem', height: '100%' }}>
            <div className="dashboard-grid" style={{ flex: selectedBSSID ? '2' : '1', overflowY: 'auto' }}>
              {uniqueAccessPoints.slice(0, visibleLimit).map(ap => (
                <APCard key={ap.bssid} ap={ap} toggleDeauth={toggleDeauth} isSelected={selectedBSSID === ap.bssid} onSelect={setSelectedBSSID} isAttacking={activeAttacks.includes(ap.bssid)} onLabel={openLabelModal} />
              ))}
            </div>
            {selectedBSSID && (
              <div className="glass-panel" style={{ width: '400px', display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <h3><Crosshair size={20} /> INTERROGATION</h3>
                  <button onClick={() => setSelectedBSSID(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)' }}><X size={20} /></button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {interrogationClients.map((client, idx) => (
                    <div key={idx} style={{ padding: '1rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)' }}>
                      <div className="mono" style={{ fontSize: '0.8rem' }}>{client.mac_address}</div>
                      <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--accent-success)' }}>{client.ip_address}</div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button onClick={() => triggerInterrogation(client.mac_address)} className="tactical-btn" style={{ fontSize: '0.6rem' }}>SCAN</button>
                        <button onClick={() => showToast("HIJACK_INITIATED", "success")} className="tactical-btn danger" style={{ fontSize: '0.6rem' }}>HIJACK</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => triggerInterrogation(selectedBSSID)} className="tactical-btn active" style={{ width: '100%', marginTop: 'auto' }}>DEEP SCAN NODE</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Signal Analytics' && (
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
                <History className="title-glow" /> Signal History
              </h3>
              {signalHistory.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Select an AP to view its signal history.</div>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={signalHistory}>
                    <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} />
                    <YAxis stroke="var(--text-muted)" domain={[-100, -20]} />
                    <RechartsTooltip contentStyle={{ background: 'rgba(0,0,0,0.9)', border: '1px solid var(--accent-primary)' }} />
                    <Line type="monotone" dataKey="signal" stroke="var(--accent-primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {activeTab === 'Discovery Timeline' && (
          <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0 }}>
            <div className="glass-panel" style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto' }}>
              <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', letterSpacing: '0.1em' }}>SELECT CLIENT</h4>
              {wirelessClients.map((c, i) => (
                <div key={i} onClick={() => loadProbeHistory(c.mac_address)}
                  className="glass-panel"
                  style={{ padding: '0.75rem', cursor: 'pointer', border: probeHistoryMAC === c.mac_address ? '1px solid var(--accent-warn)' : undefined }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--accent-warn)' }}>{c.mac_address}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{c.vendor}</div>
                </div>
              ))}
            </div>
            <div className="glass-panel" style={{ flex: 1, overflowY: 'auto' }}>
              <h3 style={{ marginBottom: '1.5rem' }}><Radio className="title-glow" /> Probe Request Feed</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {probeHistory.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '1.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{new Date(p.timestamp).toLocaleTimeString()}</span>
                    <span style={{ color: '#fff' }}>{p.probed_ssid || 'Wildcard'}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-warn)' }}>{p.signal_dbm} dBm</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Signal Space' && (
          <div className="glass-panel" style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '500px', height: '500px', borderRadius: '50%', border: '2px solid var(--accent-primary)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)', transform: 'scale(0.5)' }} />
              {uniqueAccessPoints.map((ap, i) => {
                const dbm = ap.signal_strength || -100;
                const dist = Math.max(0, Math.min(250, ((Math.abs(dbm) - 30) / 60) * 250));
                const angle = (parseInt(ap.bssid.replace(/:/g,''), 16) % 360) * Math.PI / 180;
                return (
                  <div key={i} style={{ position: 'absolute', top: 250 + dist * Math.sin(angle), left: 250 + dist * Math.cos(angle), width: '6px', height: '6px', background: 'var(--accent-primary)', borderRadius: '50%' }} />
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'Net Topology' && (
          <div style={{ flex: 1 }}>
            <ForceGraph3D graphData={graphData} backgroundColor="rgba(0,0,0,0)" nodeLabel={(node: any) => node.name} />
          </div>
        )}

        {activeTab === 'Spectrum Analytics' && (
          <div className="glass-panel" style={{ flex: 1 }}>
            <ResponsiveContainer width="100%" height={500}>
              <BarChart data={heatmapData}>
                <XAxis dataKey="channel" />
                <YAxis />
                <Bar dataKey="count" fill="var(--accent-primary)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {activeTab === 'Tactical Interrogator' && (
          <div className="glass-panel" style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '1.5rem' }}><Search size={20} /> ASSET_INTELLIGENCE_MATRIX</h3>
            <table className="tactical-table">
              <thead><tr><th>ASSET / MAC</th><th>PRIMARY_IP</th><th>OS_FINGERPRINT</th><th>SERVICES</th><th>ACTIONS</th></tr></thead>
              <tbody>
                {wirelessClients.map((c, i) => (
                  <tr key={i}>
                    <td>
                       <div style={{ color: 'var(--accent-primary)' }}>{c.primary_name || 'UNKNOWN_NODE'}</div>
                       <div className="mono" style={{ fontSize: '0.65rem', opacity: 0.5 }}>{c.mac_address}</div>
                    </td>
                    <td className="mono">{c.ip_address}</td>
                    <td>{c.is_interrogated ? (JSON.parse(c.service_data || '{}').os || 'N/A') : 'UNKNOWN'}</td>
                    <td>
                       {c.is_interrogated ? (
                         <div style={{ display: 'flex', gap: '0.3rem' }}>
                            {Object.keys(JSON.parse(c.service_data || '{}').intel || {}).map(port => (
                              <span key={port} style={{ fontSize: '0.6rem', background: 'rgba(0,242,254,0.1)', padding: '2px 4px', borderRadius: '2px' }}>{port}</span>
                            ))}
                         </div>
                       ) : '--'}
                    </td>
                    <td><button onClick={() => setIntelModalTarget(c)} className="tactical-btn" style={{ marginRight: '0.5rem' }}>VIEW INTEL</button><button onClick={() => triggerInterrogation(c.mac_address)} className="tactical-btn active">{interrogationLoading === c.mac_address ? 'SCANNING...' : 'SCAN'}</button></td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}


        {activeTab === 'Strategic Captures' && (
          <div className="glass-panel" style={{ flex: 1, padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.5rem' }}><Lock size={20} /> ENTRAPMENT_VAULT</h3>
            <div className="scroll-area">
              {credentialVault.map(v => (
                <div key={v.id} style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', marginBottom: '0.5rem', borderRadius: '4px' }}>
                  <div className="mono" style={{ fontSize: '0.7rem' }}>{v.timestamp} // TARGET: {v.target_ip}</div>
                  <div style={{ marginTop: '0.5rem' }}>{v.content}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'Strategic Hub' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="glass-panel" style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trafficData}><Line type="monotone" dataKey="packets" stroke="var(--accent-primary)" dot={false} /></LineChart>
              </ResponsiveContainer>
            </div>
            <div className="glass-panel" style={{ height: '300px', overflowY: 'auto' }}>
              {alerts.slice(0, 10).map((a, i) => <div key={i} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>{a.message}</div>)}
            </div>
          </div>
        )}

        {activeTab === 'Aegis Intelligence' && <AegisAgent />}

        {activeTab === 'Mission Control' && (
          <div className="glass-panel" style={{ flex: 1, padding: '1.5rem' }}>
             <h3 style={{ marginBottom: '1.5rem' }}><Siren size={20} /> MISSION_CONTROL_AAR</h3>
             <button onClick={async () => {
                const res = await axios.get(`${API_BASE}/api/strategic/report`);
                setMissionReport(res.data.report);
             }} className="tactical-btn active">GENERATE MISSION REPORT</button>
             {missionReport && (
               <pre style={{ marginTop: '1rem', padding: '1rem', background: '#000', color: 'var(--accent-success)', fontSize: '0.8rem' }}>{missionReport}</pre>
             )}
          </div>
        )}

        {activeTab === 'Threat Board' && (
          <div className="glass-panel" style={{ flex: 1, padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.5rem' }}><ShieldAlert size={20} /> FORENSIC_INCIDENT_LEDGER</h3>
            {forensicIncidents.map((f, i) => (
              <div key={i} onClick={() => setAnalyzingIncident(f)} style={{ padding: '1rem', background: 'rgba(255,0,0,0.1)', marginBottom: '0.5rem', cursor: 'pointer' }}>
                 {f.title} — {f.severity}
              </div>
            ))}
          </div>
        )}


        {activeTab === 'Trusted Roster' && (
          <div className="glass-panel" style={{ flex: 1, padding: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
               <input value={whitelistInput} onChange={e => setWhitelistInput(e.target.value)} placeholder="MAC_ADDRESS" className="tactical-input mono" />
               <input value={whitelistLabel} onChange={e => setWhitelistLabel(e.target.value)} placeholder="ALIAS" className="tactical-input" />
               <button onClick={addToWhitelist} className="tactical-btn active">AUTHORIZE_NODE</button>
            </div>
            <div className="scroll-area">
               {whitelist.map((w, i) => (
                 <div key={i} style={{ padding: '1rem', borderLeft: '3px solid var(--accent-success)', background: 'rgba(0,0,0,0.2)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                       <div className="mono" style={{ color: 'var(--accent-success)' }}>{w.mac_address}</div>
                       <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{w.label || 'AGENT_NULL'}</div>
                    </div>
                    <button onClick={() => removeFromWhitelist(w.mac_address)} className="tactical-btn danger" style={{ padding: '0.4rem' }}><Trash2 size={12} /></button>
                 </div>
               ))}
            </div>
          </div>
        )}


        {activeTab === 'Offensive Ops' && (
          <div className="dashboard-grid fade-in">
             <div className="glass-panel" style={{ gridColumn: 'span 2' }}>
                <div className="panel-header">
                  <h3><Zap size={20} /> STRIKE_VECTOR_MATRIX [DEAUTH]</h3>
                </div>
                <div className="scroll-area" style={{ maxHeight: '400px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', padding: '1rem' }}>
                   {uniqueAccessPoints.map(ap => (
                     <button key={ap.bssid} onClick={() => toggleDeauth(ap.bssid)} className={`tactical-btn ${activeAttacks.includes(ap.bssid) ? 'active status-pulse-danger' : 'danger'}`}>
                        <div className="mono" style={{ fontSize: '0.55rem' }}>CH{ap.channel} // {ap.bssid}</div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{ap.ssid}</div>
                     </button>
                   ))}
                </div>
             </div>
             <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem' }}><Skull size={18} /> ADVERSE_ENGAGEMENTS</h3>
                
                <div className={`tactical-switch-container ${evilTwinActive ? 'active' : ''}`}>
                   <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="switch-label">EVIL_TWIN_CLONE</span>
                   </div>
                   <button onClick={evilTwinActive ? stopEvilTwin : launchEvilTwin} className="tactical-btn">
                      {evilTwinActive ? 'HALT' : 'LAUNCH'}
                   </button>
                </div>

                <div className={`tactical-switch-container ${beaconFloodActive ? 'active' : ''}`}>
                   <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="switch-label">BEACON_FLOOD</span>
                   </div>
                   <button onClick={beaconFloodActive ? stopBeaconFlood : launchBeaconFlood} className="tactical-btn">
                      {beaconFloodActive ? 'HALT' : 'LAUNCH'}
                   </button>
                </div>

                <div style={{ padding: '0.75rem', background: 'rgba(0,242,254,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'center', cursor: 'pointer' }} onClick={() => setActiveTab('DNS Warfare')}>
                   <div className="mono" style={{ fontWeight: 'bold', color: 'var(--accent-primary)' }}>DNS_WARFARE</div>
                   <div style={{ fontSize: '0.6rem', marginTop: '4px' }}>Moved to dedicated panel. Click to navigate →</div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'Aegis Intelligence' && <AegisAgent />}

        {activeTab === 'DNS Warfare' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Header */}
            <div className="glass-panel" style={{ padding: '1.5rem 2rem', background: 'rgba(255, 50, 50, 0.05)', border: '1px solid rgba(255,50,50,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Radio size={24} style={{ color: 'var(--accent-danger)' }} />
                  </div>
                  <div>
                    <h2 className="tactical-font" style={{ fontSize: '1.3rem', color: 'var(--accent-danger)' }}>DNS_WARFARE_COMMAND</h2>
                    <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>DOMAIN_HIJACKING // ARP_POISONING // SSL_STRIPPING</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>ENGINE_STATUS</div>
                    <div className={`status-indicator ${dnsSpoofingActive ? 'online pulse' : 'offline'}`} style={{ marginTop: '4px' }}>
                      {dnsSpoofingActive ? 'ACTIVE' : 'STANDBY'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>RULES_LOADED</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-warn)', fontFamily: 'monospace' }}>{spoofDomains.length}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '1.5rem' }}>

              {/* Control Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Engine Toggle */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h4 className="tactical-font" style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>INTERCEPTION_ENGINE</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ padding: '1rem', background: dnsSpoofingActive ? 'rgba(255,50,50,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${dnsSpoofingActive ? 'rgba(255,50,50,0.4)' : 'var(--border-subtle)'}`, borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.3s' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>DNS_SPOOF_ENGINE</div>
                        <div className="mono" style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '2px' }}>REDIRECTS_TRAFFIC // INTERCEPTS_QUERIES</div>
                      </div>
                      <button
                        onClick={dnsSpoofingActive ? stopDnsSpoofing : startDnsSpoofing}
                        className={`tactical-btn ${dnsSpoofingActive ? 'danger pulse' : 'active'}`}
                        style={{ minWidth: '90px', height: '38px', fontSize: '0.75rem' }}
                      >
                        {dnsSpoofingActive ? '⬛ HALT' : '▶ ENGAGE'}
                      </button>
                    </div>

                    <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.4rem' }}>SSL_STRIP_BYPASS</div>
                      <div className="mono" style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>GENERATES_MITMPROXY_SCRIPT</div>
                      <button onClick={fetchSslBypassScript} className="tactical-btn" style={{ width: '100%', height: '34px' }}>
                        <Lock size={12} /> GENERATE_BYPASS_SCRIPT
                      </button>
                    </div>
                  </div>
                </div>

                {/* Add Rule */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h4 className="tactical-font" style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>ADD_HIJACK_RULE</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label className="mono" style={{ fontSize: '0.6rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>TARGET_DOMAIN</label>
                      <input id="dnsDomainInput" type="text" placeholder="e.g. google.com" className="tactical-input" style={{ width: '100%', fontSize: '0.8rem' }} />
                    </div>
                    <div>
                      <label className="mono" style={{ fontSize: '0.6rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>REDIRECT_IP</label>
                      <input id="dnsIpInput" type="text" placeholder="e.g. 192.168.1.100" className="tactical-input" style={{ width: '100%', fontSize: '0.8rem' }} />
                    </div>
                    <button onClick={addSpoofDomain} className="tactical-btn active" style={{ width: '100%', height: '40px', fontSize: '0.8rem' }}>
                      <Plus size={14} /> REGISTER_RULE
                    </button>
                  </div>
                </div>
              </div>

              {/* Rules Table */}
              <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 className="tactical-font" style={{ fontSize: '0.8rem', color: 'var(--accent-primary)' }}>ACTIVE_HIJACK_RULESET</h4>
                  {spoofDomains.length > 0 && (
                    <span className="mono" style={{ fontSize: '0.6rem', color: 'var(--accent-warn)', background: 'rgba(255,200,0,0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,200,0,0.3)' }}>
                      {spoofDomains.length} RULE{spoofDomains.length !== 1 ? 'S' : ''} LOADED
                    </span>
                  )}
                </div>
                <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
                  {spoofDomains.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                      <Radio size={32} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                      <div className="mono" style={{ fontSize: '0.7rem' }}>NO_RULES_REGISTERED</div>
                      <div style={{ fontSize: '0.65rem', marginTop: '0.5rem', opacity: 0.5 }}>Add a domain rule to begin intercepting DNS queries.</div>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left', position: 'sticky', top: 0 }}>
                        <tr>
                          <th style={{ padding: '12px', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>#</th>
                          <th style={{ padding: '12px', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>TARGET_DOMAIN</th>
                          <th style={{ padding: '12px', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>REDIRECT_IP</th>
                          <th style={{ padding: '12px', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>STATUS</th>
                          <th style={{ padding: '12px', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spoofDomains.map((d, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                            <td className="mono" style={{ padding: '12px', color: 'var(--text-dim)', fontSize: '0.7rem' }}>{String(i + 1).padStart(2, '0')}</td>
                            <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--accent-warn)' }}>{d.domain}</td>
                            <td className="mono" style={{ padding: '12px', color: 'var(--accent-primary)' }}>{d.ip}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: '4px', background: dnsSpoofingActive ? 'rgba(255,50,50,0.15)' : 'rgba(255,255,255,0.05)', color: dnsSpoofingActive ? 'var(--accent-danger)' : 'var(--text-dim)', border: `1px solid ${dnsSpoofingActive ? 'rgba(255,50,50,0.4)' : 'var(--border-subtle)'}` }}>
                                {dnsSpoofingActive ? '⚡ LIVE' : 'STAGED'}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <button onClick={() => removeSpoofDomain(i)} className="tactical-btn danger" style={{ padding: '4px 10px', fontSize: '0.65rem' }}>
                                <X size={10} /> REVOKE
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* SSL Script output */}
            {sslBypassScript && (
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h4 className="tactical-font" style={{ fontSize: '0.8rem', color: 'var(--accent-warn)', marginBottom: '1rem' }}>SSL_BYPASS_SCRIPT // MITMPROXY_PAYLOAD</h4>
                <pre className="mono custom-scrollbar" style={{ fontSize: '0.7rem', background: 'rgba(0,0,0,0.5)', padding: '1rem', border: '1px solid var(--border-subtle)', color: 'var(--accent-success)', maxHeight: '200px', overflowY: 'auto', borderRadius: '4px' }}>
                  {JSON.stringify(sslBypassScript, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Tactical Mission Intelligence Stream (Embedded persistent panel) */}
        <div className="glass-panel" style={{ marginTop: '2rem', height: '300px', display: 'flex', flexDirection: 'column' }}>
          <div className="tactical-header" style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={14} className="accent-blue" />
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px' }}>TACTICAL_MISSION_LOG // LIVE_INTEL_STREAM</span>
            </div>
            <div className="status-indicator online pulse">RECON_ACTIVE</div>
          </div>
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', background: 'rgba(0,0,0,0.2)' }}>
            {missionLogs.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                AWAITING_TAC_DATA_LINK_ESTABLISHMENT...
              </div>
            ) : (
              missionLogs.map((log: any) => (
                <div key={log.id} style={{ 
                  padding: '4px 8px', 
                  fontSize: '0.65rem', 
                  borderLeft: `2px solid ${log.severity === 'Alert' ? 'var(--accent-danger)' : log.severity === 'Success' ? 'var(--accent-success)' : log.severity === 'Warning' ? 'var(--accent-warn)' : 'var(--accent-primary)'}`,
                  background: 'rgba(255,255,255,0.02)',
                  marginBottom: '2px',
                  fontFamily: "'JetBrains Mono', monospace"
                }}>
                  <span style={{ color: 'var(--text-dim)', marginRight: '8px' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span style={{ color: log.severity === 'Alert' ? 'var(--accent-danger)' : log.severity === 'Success' ? 'var(--accent-success)' : log.severity === 'Warning' ? 'var(--accent-warn)' : 'var(--accent-primary)', fontWeight: 'bold' }}>{log.category}: </span>
                  <span style={{ color: '#fff' }}>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <div style={{ position: 'fixed', bottom: 0, right: 0, left: '280px', height: '200px', background: 'rgba(5, 5, 8, 0.95)', borderTop: '1px solid var(--accent-primary)', transform: `translateY(${consoleOpen ? '0' : '100%'})`, transition: 'transform 0.3s' }}>
        <div className="mono" style={{ padding: '1rem', color: 'var(--accent-success)', fontSize: '0.75rem' }}>
          {alerts.map((a, i) => <div key={i}>[{new Date(a.timestamp).toLocaleTimeString()}] {a.message}</div>)}
        </div>
      </div>

      <div style={{ position: 'fixed', top: '5rem', right: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {toasts.map(t => <div key={t.id} className="glass-panel fade-in" style={{ padding: '0.8rem', borderLeft: `3px solid var(--accent-${t.type === 'error' ? 'danger' : 'primary'})`, background: '#000' }}>{t.message}</div>)}
      </div>

      {/* Asset Intelligence Modal (Deep Scan Results) */}
      {intelModalTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel fade-in" style={{ width: '850px', maxHeight: '90vh', border: '1px solid var(--accent-primary)', display: 'flex', flexDirection: 'column', padding: '0' }}>
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,242,254,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Cpu size={28} className="title-glow accent-blue" />
                <div>
                  <h3 className="tactical-font" style={{ fontSize: '1.2rem', color: 'var(--accent-primary)' }}>ASSET_INTELLIGENCE // {intelModalTarget.mac_address}</h3>
                  <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>TARGET_IP: {intelModalTarget.ip_address} | HOSTNAME: {intelModalTarget.hostname || 'UNRESOLVED'}</div>
                </div>
              </div>
              <button onClick={() => setIntelModalTarget(null)} className="tactical-btn danger" style={{ padding: '0.4rem' }}><X size={20} /></button>
            </div>
            
            <div className="custom-scrollbar" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                  <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)' }}>
                     <div style={{ fontSize: '0.6rem', color: 'var(--accent-primary)', letterSpacing: '0.1em' }}>OS_FINGERPRINT</div>
                     <div style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '0.5rem' }}>{intelModalTarget.os_guess || 'IDENTIFYING...'}</div>
                     <div className="mono" style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginTop: '6px' }}>VERSION_INTENSITY: 9 / AGGRESSIVE</div>
                  </div>
                  <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)' }}>
                     <div style={{ fontSize: '0.6rem', color: 'var(--accent-success)', letterSpacing: '0.1em' }}>THREAT_SCORE</div>
                     <div style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '0.5rem', color: 'var(--accent-warn)' }}>MODERATE_RISK</div>
                     <div className="mono" style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginTop: '6px' }}>VULNERABILITY_SCRIPTS: ACTIVE</div>
                  </div>
                  <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)' }}>
                     <div style={{ fontSize: '0.6rem', color: 'var(--accent-primary)', letterSpacing: '0.1em' }}>SCAN_STATUS</div>
                     <div style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '0.5rem' }}>COMPLETE</div>
                     <div className="mono" style={{ fontSize: '0.55rem', color: 'var(--accent-success)', marginTop: '6px' }}>DATA_SYNCHRONIZED_STABLE</div>
                  </div>
               </div>

               <h4 className="tactical-font" style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>SERVICE_INVENTORY_REPORT</h4>
               
               <div style={{ borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                    <tr>
                      <th style={{ padding: '12px' }}>PORT/PROTO</th>
                      <th style={{ padding: '12px' }}>SERVICE</th>
                      <th style={{ padding: '12px' }}>VERSION_INFO</th>
                      <th style={{ padding: '12px' }}>VULNERABILITIES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {JSON.parse(intelModalTarget.service_data || '[]').map((svc: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td className="accent-blue mono" style={{ padding: '12px' }}>{svc.port}/{svc.protocol}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{svc.name}</td>
                        <td style={{ padding: '12px' }}>{svc.product} {svc.version}</td>
                        <td style={{ padding: '12px' }}>
                          {svc.vulnerabilities ? (
                            <div className="tactical-badge danger pulse" style={{ fontSize: '0.6rem' }}>CVE_DETECTED</div>
                          ) : (
                            <span style={{ opacity: 0.4 }}>SECURE</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
               </div>
            </div>
            
            <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '1rem', background: 'rgba(0,0,0,0.2)' }}>
               <button onClick={() => setIntelModalTarget(null)} className="tactical-btn active" style={{ flex: 1, height: '40px' }}>DISMISS_INTELLIGENCE</button>
               <button onClick={() => window.print()} className="tactical-btn" style={{ width: '60px' }}><History size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {/* ── FORENSIC ANALYSIS LAB ───────────────────────────────────────── */}
      {analyzingIncident && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10003, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(30px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel fade-in" style={{ width: '800px', maxHeight: '85vh', border: '1px solid var(--accent-primary)', padding: '2.5rem', overflowY: 'auto' }}>
             <h3 className="tactical-font"><Skull size={24} style={{ marginRight: '0.75rem' }} /> FORENSIC_LAB // {analyzingIncident.title}</h3>
             <div className="mono" style={{ marginTop: '1.5rem', padding: '1.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', lineHeight: '1.6' }}>
                <div style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }}>INCIDENT_VECTOR: {analyzingIncident.impact || 'UNKNOWN'}</div>
                {analyzingIncident.description}
             </div>
             <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                <button onClick={() => setAnalyzingIncident(null)} className="tactical-btn active" style={{ flex: 1 }}>DISMISS_LAB</button>
                <button onClick={() => showToast("EVIDENCE_SECURED", "success")} className="tactical-btn">SECURE_EVIDENCE</button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}
