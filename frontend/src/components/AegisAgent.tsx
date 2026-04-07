import { useState, useEffect, useRef } from 'react';
import { Send, Terminal, Cpu, Shield } from 'lucide-react';

interface LogEntry {
  type: 'thought' | 'tool_start' | 'tool_result' | 'complete' | 'error' | 'user';
  message?: string;
  tool?: string;
  args?: any;
  result?: string;
  timestamp: string;
}

export function AegisAgent() {
  const [messages, setMessages] = useState<LogEntry[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'IDLE' | 'CONNECTED' | 'ERROR'>('IDLE');
  const ws = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    connect();
    return () => ws.current?.close();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const connect = () => {
    const wsUrl = 'ws://localhost:8000/api/agent/stream';
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => setConnectionStatus('CONNECTED');
    ws.current.onerror = () => setConnectionStatus('ERROR');
    ws.current.onclose = () => {
      setConnectionStatus('IDLE');
      setTimeout(connect, 5000);
    };

    ws.current.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      const newEntry: LogEntry = {
        ...payload,
        timestamp: new Date().toLocaleTimeString()
      };
      
      setMessages(prev => [...prev, newEntry]);
      
      if (payload.type === 'complete' || payload.type === 'error') {
        setIsThinking(false);
      }
    };
  };

  const sendMessage = () => {
    if (!input.trim() || !ws.current) return;
    
    const userMsg: LogEntry = {
      type: 'user',
      message: input,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setMessages(prev => [...prev, userMsg]);
    ws.current.send(JSON.stringify({ message: input }));
    setInput('');
    setIsThinking(true);
  };

  return (
    <div style={{ display: 'flex', gap: '1.5rem', height: '100%', minHeight: '600px' }}>
      {/* Main Chat Area */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', background: 'rgba(0,0,0,0.4)', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Cpu className="title-glow" size={24} />
            <div>
              <h3 style={{ fontSize: '1.1rem' }}>AEGIS INTELLIGENCE CENTER</h3>
              <div style={{ fontSize: '0.6rem', color: connectionStatus === 'CONNECTED' ? 'var(--accent-success)' : 'var(--accent-warn)', letterSpacing: '0.1em' }}>
                STATUS // {connectionStatus} // BRAIN: LOCAL_LM_STUDIO
              </div>
            </div>
          </div>
          {isThinking && <div className="radar-pulse" style={{ height: '10px', width: '10px' }}></div>}
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.5rem', marginBottom: '1rem' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-dim)' }}>
               <Shield size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
               <p style={{ fontSize: '0.9rem' }}>Awaiting tactical parameters...</p>
               <p style={{ fontSize: '0.7rem', marginTop: '0.5rem', fontStyle: 'italic' }}>Try asking: "List the files in the backend" or "Create a new CSS glow effect"</p>
            </div>
          )}
          {messages.filter(m => ['user', 'thought', 'complete', 'error'].includes(m.type)).map((m, i) => (
            <div key={i} style={{ 
              alignSelf: m.type === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '1rem',
              borderRadius: '8px',
              background: m.type === 'user' ? 'rgba(0,242,254,0.1)' : 'rgba(255,255,255,0.03)',
              border: m.type === 'user' ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.05)',
              borderLeft: m.type === 'thought' ? '3px solid var(--accent-secondary)' : undefined
            }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>{m.type.toUpperCase()} // AEGIS_INTEL</span>
                <span>{m.timestamp}</span>
              </div>
              <div style={{ fontSize: '0.95rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{m.message}</div>
            </div>
          ))}
          {isThinking && (
            <div style={{ alignSelf: 'flex-start', padding: '1rem', color: 'var(--accent-primary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="radar-pulse" style={{ width: '8px', height: '8px' }}></div> Analyzing project vectors...
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Identify tactical objective..."
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid var(--accent-primary)',
              borderRadius: '8px',
              padding: '1rem',
              paddingRight: '3rem',
              color: '#fff',
              outline: 'none',
              fontFamily: 'inherit'
            }}
          />
          <button 
            onClick={sendMessage}
            style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer' }}>
            <Send size={20} />
          </button>
        </div>
      </div>

      {/* Tactical Execution side-panel */}
      <div className="glass-panel" style={{ width: '350px', display: 'flex', flexDirection: 'column', padding: '1.25rem', background: 'rgba(0,0,0,0.6)', borderLeft: '2px solid var(--accent-primary)' }}>
        <h4 style={{ fontSize: '0.8rem', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--accent-secondary)' }}>
          <Terminal size={16} /> EXECUTION // TRACE_LOG
        </h4>
        
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {messages.filter(m => ['tool_start', 'tool_result'].includes(m.type)).length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', textAlign: 'center', marginTop: '2rem', fontStyle: 'italic' }}>
              No active tools in flight...
            </div>
          )}
          {messages.filter(m => ['tool_start', 'tool_result'].includes(m.type)).map((m, i) => (
            <div key={i} style={{ 
              fontSize: '0.75rem', 
              fontFamily: 'monospace', 
              padding: '0.75rem', 
              background: 'rgba(0,0,0,0.4)', 
              borderRadius: '4px',
              borderLeft: `2px solid ${m.type === 'tool_start' ? 'var(--accent-warn)' : 'var(--accent-success)'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: m.type === 'tool_start' ? 'var(--accent-warn)' : 'var(--accent-success)' }}>
                  {m.type === 'tool_start' ? '>> INITIATING' : '<< OBSERVED'}
                </span>
                <span style={{ color: 'var(--text-dim)' }}>{m.timestamp.split(' ')[0]}</span>
              </div>
              <div style={{ color: '#fff' }}>
                {m.type === 'tool_start' ? (
                  <>
                    <span style={{ color: 'var(--accent-secondary)' }}>{m.tool}</span>({JSON.stringify(m.args)})
                  </>
                ) : (
                  <div style={{ 
                    marginTop: '0.4rem', 
                    maxHeight: '100px', 
                    overflowY: 'auto', 
                    whiteSpace: 'pre-wrap', 
                    fontSize: '0.7rem',
                    color: 'var(--text-dim)'
                  }}>{m.result}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
