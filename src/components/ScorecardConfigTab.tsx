'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, RotateCcw, Save, Clock, Zap, Layers, Truck, CheckCircle, Star, Plus, X, Search, BookOpen, ArrowRight, Database, Filter, BarChart3, MapPin, Users, Route, Mail } from 'lucide-react';

// ─── Default Configuration ──────────────────────────────────────────────────

const STORAGE_KEY = 'scheduler-scorecard-config';

export interface SchedulerConfig {
  priorityScores: {
    emergency: { baseScore: number; responseHours: number };
    high:      { baseScore: number; responseHours: number };
    medium:    { baseScore: number; responseHours: number };
    low:       { baseScore: number; responseHours: number };
    advisory:  { baseScore: number; responseHours: number };
  };
  durationDefaults: {
    reactive:    number;
    maintenance: number;
    other:       number;
  };
  scheduling: {
    businessStartHour: number;
    businessEndHour:   number;
    maxDriveMinutes:   number;
  };
  cluster: {
    pointsPerColocated: number;
    maxClusterBonus:    number;
  };
  vipCustomers: {
    topTier: string[];
    midTier: string[];
    lowTier: string[];
  };
}

const DEFAULT_CONFIG: SchedulerConfig = {
  priorityScores: {
    emergency: { baseScore: 100, responseHours: 24 },
    high:      { baseScore: 60,  responseHours: 48 },
    medium:    { baseScore: 40,  responseHours: 72 },
    low:       { baseScore: 20,  responseHours: 96 },
    advisory:  { baseScore: 10,  responseHours: 120 },
  },
  durationDefaults: {
    reactive:    1.5,
    maintenance: 6.0,
    other:       2.0,
  },
  scheduling: {
    businessStartHour: 6,
    businessEndHour:   18,
    maxDriveMinutes:   180,
  },
  cluster: {
    pointsPerColocated: 2,
    maxClusterBonus:    15,
  },
  vipCustomers: {
    topTier: ['VIP1', 'MEGA_CORP'],
    midTier: ['TIER2'],
    lowTier: [],
  },
};

/** Reads from localStorage and returns the current config, falling back to defaults for any missing keys. */
export function getSchedulerConfig(): SchedulerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      priorityScores: {
        emergency: { ...DEFAULT_CONFIG.priorityScores.emergency, ...parsed?.priorityScores?.emergency },
        high:      { ...DEFAULT_CONFIG.priorityScores.high,      ...parsed?.priorityScores?.high },
        medium:    { ...DEFAULT_CONFIG.priorityScores.medium,     ...parsed?.priorityScores?.medium },
        low:       { ...DEFAULT_CONFIG.priorityScores.low,        ...parsed?.priorityScores?.low },
        advisory:  { ...DEFAULT_CONFIG.priorityScores.advisory,   ...parsed?.priorityScores?.advisory },
      },
      durationDefaults: { ...DEFAULT_CONFIG.durationDefaults, ...parsed?.durationDefaults },
      scheduling:       { ...DEFAULT_CONFIG.scheduling,       ...parsed?.scheduling },
      cluster:          { ...DEFAULT_CONFIG.cluster,          ...parsed?.cluster },
      vipCustomers: {
        topTier: parsed?.vipCustomers?.topTier || [...DEFAULT_CONFIG.vipCustomers.topTier],
        midTier: parsed?.vipCustomers?.midTier || [...DEFAULT_CONFIG.vipCustomers.midTier],
        lowTier: parsed?.vipCustomers?.lowTier || [...DEFAULT_CONFIG.vipCustomers.lowTier],
      },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const sectionCard: React.CSSProperties = {
  backgroundColor: 'rgba(26, 35, 50, 0.6)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  padding: '24px',
  backdropFilter: 'blur(12px)',
};

const sectionHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '20px',
  paddingBottom: '12px',
  borderBottom: '1px solid var(--border-color)',
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 700,
  color: 'var(--text-main)',
  letterSpacing: '0.02em',
};

const sectionSubtitle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.78rem',
  color: 'var(--text-muted)',
  fontWeight: 400,
};

const fieldRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '16px',
  marginBottom: '12px',
};

const fieldGroup: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--text-muted)',
  letterSpacing: '0.03em',
  textTransform: 'uppercase' as const,
};

const inputStyle: React.CSSProperties = {
  padding: '9px 14px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--surface-color)',
  color: 'var(--text-main)',
  fontSize: '0.9rem',
  fontWeight: 500,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s ease',
};

const priorityRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr 1fr',
  gap: '12px',
  alignItems: 'center',
  padding: '10px 14px',
  borderRadius: '8px',
  marginBottom: '6px',
};

const btnBase: React.CSSProperties = {
  padding: '10px 24px',
  borderRadius: '8px',
  border: 'none',
  fontWeight: 700,
  fontSize: '0.88rem',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  transition: 'all 0.2s ease',
};

// ─── Priority badge colors ─────────────────────────────────────────────────

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  emergency: { label: 'Emergency (P1)', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
  high:      { label: 'High (P2)',      color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' },
  medium:    { label: 'Medium (P3)',    color: '#eab308', bg: 'rgba(234, 179, 8, 0.12)' },
  low:       { label: 'Low (P4)',       color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  advisory:  { label: 'Advisory (P5)',  color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
};

// ─── Customer Autocomplete Component ───────────────────────────────────────

function CustomerAutocomplete({ allCustomers, existingCustomers, color, onAdd }: {
  allCustomers: string[];
  existingCustomers: string[];
  color: string;
  onAdd: (val: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = query.length >= 1
    ? allCustomers
        .filter(c => c.toLowerCase().includes(query.toLowerCase()) && !existingCustomers.includes(c))
        .slice(0, 8)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (val: string) => {
    onAdd(val);
    setQuery('');
    setShowDropdown(false);
    setHighlightIdx(0);
  };

  return (
    <div ref={wrapperRef} style={{ flex: 1, position: 'relative' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search customers..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
              setHighlightIdx(0);
            }}
            onFocus={() => { if (query.length >= 1) setShowDropdown(true); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter' && filtered[highlightIdx]) { e.preventDefault(); handleSelect(filtered[highlightIdx]); }
              else if (e.key === 'Escape') { setShowDropdown(false); }
            }}
            style={{ ...inputStyle, fontSize: '0.8rem', paddingLeft: '30px' }}
          />
        </div>
      </div>
      {showDropdown && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          marginTop: '4px', borderRadius: '8px', overflow: 'hidden',
          border: '1px solid var(--border-color)', backgroundColor: '#1a2332',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxHeight: '200px', overflowY: 'auto'
        }}>
          {filtered.map((item, idx) => (
            <div
              key={item}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setHighlightIdx(idx)}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem',
                backgroundColor: idx === highlightIdx ? `${color}22` : 'transparent',
                color: idx === highlightIdx ? color : 'var(--text-main)',
                borderBottom: idx < filtered.length - 1 ? '1px solid var(--border-color)' : 'none',
                transition: 'background-color 0.1s'
              }}
            >
              {item}
            </div>
          ))}
        </div>
      )}
      {showDropdown && query.length >= 1 && filtered.length === 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          marginTop: '4px', borderRadius: '8px', padding: '10px 12px',
          border: '1px solid var(--border-color)', backgroundColor: '#1a2332',
          fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center'
        }}>
          No matching customers found
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ScorecardConfigTab() {
  const [config, setConfig] = useState<SchedulerConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [allCustomers, setAllCustomers] = useState<string[]>([]);
  const [configTab, setConfigTab] = useState<'config' | 'algorithm'>('config');
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from localStorage on mount + fetch customer list for autocomplete
  useEffect(() => {
    setConfig(getSchedulerConfig());
    setMounted(true);
    // Fetch customer names for autocomplete
    fetch('/api/workorders')
      .then(r => r.json())
      .then(data => {
        const all = [...(data.rtsOrders || []), ...(data.scheduledOrders || [])];
        const names = [...new Set(all.map((o: any) => o.customer).filter((c: string) => c && c !== 'Unknown Client'))] as string[];
        setAllCustomers(names.sort());
      })
      .catch(() => {});
  }, []);

  // ── Updaters ──

  const updatePriority = useCallback(
    (key: keyof SchedulerConfig['priorityScores'], field: 'baseScore' | 'responseHours', value: number) => {
      setConfig(prev => ({
        ...prev,
        priorityScores: {
          ...prev.priorityScores,
          [key]: { ...prev.priorityScores[key], [field]: value },
        },
      }));
    },
    []
  );

  const updateDuration = useCallback(
    (key: keyof SchedulerConfig['durationDefaults'], value: number) => {
      setConfig(prev => ({ ...prev, durationDefaults: { ...prev.durationDefaults, [key]: value } }));
    },
    []
  );

  const updateScheduling = useCallback(
    (key: keyof SchedulerConfig['scheduling'], value: number) => {
      setConfig(prev => ({ ...prev, scheduling: { ...prev.scheduling, [key]: value } }));
    },
    []
  );

  const updateCluster = useCallback(
    (key: keyof SchedulerConfig['cluster'], value: number) => {
      setConfig(prev => ({ ...prev, cluster: { ...prev.cluster, [key]: value } }));
    },
    []
  );

  // ── Actions ──

  const handleSave = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setSaved(true);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => setSaved(false), 2400);
  }, [config]);

  const handleReset = useCallback(() => {
    setConfig({ ...DEFAULT_CONFIG });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  if (!mounted) return null; // Avoid SSR hydration mismatch

  return (
    <div
      style={{
        backgroundColor: 'var(--surface-color)',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        height: 'calc(100vh - 120px)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--primary), #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Settings size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.15rem', fontWeight: 700 }}>
              Scorecard Configuration
            </h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Adjust scoring weights, durations, and scheduling constraints
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Success message */}
          {saved && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: '#10b981',
                fontSize: '0.85rem',
                fontWeight: 600,
                animation: 'fadeIn 0.25s ease',
              }}
            >
              <CheckCircle size={16} />
              Configuration saved
            </span>
          )}

          <button
            onClick={handleReset}
            style={{
              ...btnBase,
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
            }}
            onMouseEnter={e => { (e.currentTarget.style.borderColor = 'var(--text-muted)'); }}
            onMouseLeave={e => { (e.currentTarget.style.borderColor = 'var(--border-color)'); }}
          >
            <RotateCcw size={15} />
            Reset to Defaults
          </button>

          <button
            onClick={handleSave}
            style={{
              ...btnBase,
              background: 'linear-gradient(135deg, var(--primary), #059669)',
              color: '#fff',
              boxShadow: '0 2px 12px rgba(16, 185, 129, 0.25)',
            }}
            onMouseEnter={e => { (e.currentTarget.style.opacity = '0.9'); }}
            onMouseLeave={e => { (e.currentTarget.style.opacity = '1'); }}
          >
            <Save size={15} />
            Save Configuration
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', background: 'rgba(26, 35, 50, 0.5)', borderRadius: '10px', padding: '3px', border: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setConfigTab('config')}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            background: configTab === 'config' ? 'linear-gradient(135deg, var(--primary), #059669)' : 'transparent',
            color: configTab === 'config' ? '#fff' : 'var(--text-muted)',
            transition: 'all 0.2s ease',
          }}
        >
          <Settings size={15} /> Configuration
        </button>
        <button
          onClick={() => setConfigTab('algorithm')}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            background: configTab === 'algorithm' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'transparent',
            color: configTab === 'algorithm' ? '#fff' : 'var(--text-muted)',
            transition: 'all 0.2s ease',
          }}
        >
          <BookOpen size={15} /> Algorithm Details
        </button>
      </div>

      {configTab === 'config' && (<>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '4px' }}>
        {/* ─── Section 1: Priority Base Scores ─── */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <Zap size={18} color="var(--primary)" />
            <div>
              <h3 style={sectionTitle}>Priority Base Scores</h3>
              <p style={sectionSubtitle}>Score assigned to each priority level and its SLA response window</p>
            </div>
          </div>

          {/* Column headers */}
          <div style={{ ...priorityRowStyle, marginBottom: '4px', padding: '0 14px 6px 14px' }}>
            <span style={labelStyle}>Priority</span>
            <span style={labelStyle}>Base Score</span>
            <span style={labelStyle}>Response Window (hrs)</span>
          </div>

          {(Object.keys(PRIORITY_META) as Array<keyof typeof PRIORITY_META>).map(key => {
            const meta = PRIORITY_META[key];
            const pKey = key as keyof SchedulerConfig['priorityScores'];
            return (
              <div
                key={key}
                style={{
                  ...priorityRowStyle,
                  backgroundColor: meta.bg,
                  border: `1px solid ${meta.color}22`,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: meta.color }}>
                  {meta.label}
                </span>
                <input
                  type="number"
                  value={config.priorityScores[pKey].baseScore}
                  onChange={e => updatePriority(pKey, 'baseScore', Number(e.target.value))}
                  min={0}
                  max={200}
                  style={inputStyle}
                />
                <input
                  type="number"
                  value={config.priorityScores[pKey].responseHours}
                  onChange={e => updatePriority(pKey, 'responseHours', Number(e.target.value))}
                  min={1}
                  max={720}
                  style={inputStyle}
                />
              </div>
            );
          })}
        </div>

        {/* ─── Section 2: Duration Defaults ─── */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <Clock size={18} color="var(--primary)" />
            <div>
              <h3 style={sectionTitle}>Duration Defaults</h3>
              <p style={sectionSubtitle}>Default work duration (hours) by case type when not specified in the work order</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            {([
              { key: 'reactive'    as const, label: 'Reactive',          desc: 'Break/fix, emergency repairs' },
              { key: 'maintenance' as const, label: 'Maintenance',       desc: 'Scheduled preventive maintenance' },
              { key: 'other'       as const, label: 'Other / CM',        desc: 'Corrective maintenance, misc.' },
            ]).map(item => (
              <div
                key={item.key}
                style={{
                  ...fieldGroup,
                  backgroundColor: 'rgba(16, 185, 129, 0.04)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '16px',
                }}
              >
                <span style={{ ...labelStyle, fontSize: '0.85rem', textTransform: 'none', color: 'var(--text-main)' }}>
                  {item.label}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  {item.desc}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    step={0.5}
                    min={0.5}
                    max={24}
                    value={config.durationDefaults[item.key]}
                    onChange={e => updateDuration(item.key, Number(e.target.value))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>hours</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Bottom row: Scheduling Constraints + Cluster Scoring ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Scheduling Constraints */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <Truck size={18} color="var(--primary)" />
              <div>
                <h3 style={sectionTitle}>Scheduling Constraints</h3>
                <p style={sectionSubtitle}>Business hours and travel limits</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={fieldRow}>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Business Start Hour</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={config.scheduling.businessStartHour}
                      onChange={e => updateScheduling('businessStartHour', Number(e.target.value))}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      ({config.scheduling.businessStartHour > 12
                        ? `${config.scheduling.businessStartHour - 12} PM`
                        : config.scheduling.businessStartHour === 0
                          ? '12 AM'
                          : `${config.scheduling.businessStartHour} AM`})
                    </span>
                  </div>
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Business End Hour</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={config.scheduling.businessEndHour}
                      onChange={e => updateScheduling('businessEndHour', Number(e.target.value))}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      ({config.scheduling.businessEndHour > 12
                        ? `${config.scheduling.businessEndHour - 12} PM`
                        : config.scheduling.businessEndHour === 0
                          ? '12 AM'
                          : `${config.scheduling.businessEndHour} AM`})
                    </span>
                  </div>
                </div>
              </div>

              <div style={fieldGroup}>
                <label style={labelStyle}>Max Drive Time (Cross-Region)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min={15}
                    max={600}
                    value={config.scheduling.maxDriveMinutes}
                    onChange={e => updateScheduling('maxDriveMinutes', Number(e.target.value))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    minutes ({(config.scheduling.maxDriveMinutes / 60).toFixed(1)} hrs)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Cluster Scoring */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <Layers size={18} color="var(--primary)" />
              <div>
                <h3 style={sectionTitle}>Cluster Scoring</h3>
                <p style={sectionSubtitle}>Bonus points for co-located work orders</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={fieldGroup}>
                <label style={labelStyle}>Points per Co-Located Case</label>
                <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Score added for each additional case at the same location
                </p>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={config.cluster.pointsPerColocated}
                  onChange={e => updateCluster('pointsPerColocated', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div style={fieldGroup}>
                <label style={labelStyle}>Max Cluster Bonus</label>
                <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Upper cap on total cluster bonus points
                </p>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={config.cluster.maxClusterBonus}
                  onChange={e => updateCluster('maxClusterBonus', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              {/* Visual preview */}
              <div
                style={{
                  marginTop: '8px',
                  padding: '14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                }}
              >
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Preview: A location with <strong style={{ color: 'var(--text-main)' }}>5 cases</strong> earns{' '}
                  <strong style={{ color: 'var(--primary)' }}>
                    +{Math.min(5 * config.cluster.pointsPerColocated, config.cluster.maxClusterBonus)}
                  </strong>{' '}
                  cluster points (capped at {config.cluster.maxClusterBonus})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Section 5: VIP Customers ─── */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <Star size={18} color="var(--primary)" />
            <div>
              <h3 style={sectionTitle}>VIP Customers</h3>
              <p style={sectionSubtitle}>Customer codes that receive priority scoring bonuses (+20 for Top Tier, +15 for Mid Tier)</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            {(['topTier', 'midTier', 'lowTier'] as const).map(tier => {
              const label = tier === 'topTier' ? 'Top Tier (+20 pts)' : tier === 'midTier' ? 'Mid Tier (+15 pts)' : 'Low Tier (+10 pts)';
              const color = tier === 'topTier' ? '#f59e0b' : tier === 'midTier' ? '#3b82f6' : '#8b5cf6';
              return (
                <div key={tier} style={fieldGroup}>
                  <label style={labelStyle}>{label}</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px', minHeight: '36px' }}>
                    {config.vipCustomers[tier].map((cust, idx) => (
                      <span
                        key={idx}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '4px 10px', borderRadius: '6px',
                          backgroundColor: `${color}18`, border: `1px solid ${color}44`,
                          fontSize: '0.8rem', fontWeight: 600, color
                        }}
                      >
                        {cust}
                        <button
                          onClick={() => {
                            setConfig(prev => ({
                              ...prev,
                              vipCustomers: {
                                ...prev.vipCustomers,
                                [tier]: prev.vipCustomers[tier].filter((_, i) => i !== idx)
                              }
                            }));
                          }}
                          style={{
                            background: 'none', border: 'none', color, cursor: 'pointer',
                            padding: '0', display: 'flex', fontSize: '0.7rem'
                          }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', position: 'relative' }}>
                    <CustomerAutocomplete
                      allCustomers={allCustomers}
                      existingCustomers={config.vipCustomers[tier]}
                      color={color}
                      onAdd={(val) => {
                        setConfig(prev => ({
                          ...prev,
                          vipCustomers: {
                            ...prev.vipCustomers,
                            [tier]: [...prev.vipCustomers[tier], val]
                          }
                        }));
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Inline keyframe for fade-in */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input[type="number"]:focus {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
        }
        input[type="number"]::-webkit-inner-spin-button {
          opacity: 1;
        }
      `}</style>
      </>)}

      {configTab === 'algorithm' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>
          
          {/* Overview */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <BookOpen size={18} color="#8b5cf6" />
              <div>
                <h3 style={sectionTitle}>Scheduling Pipeline Overview</h3>
                <p style={sectionSubtitle}>How the auto-scheduler finds, evaluates, and assigns appointments</p>
              </div>
            </div>
            <div style={{ padding: '16px', background: 'rgba(99, 102, 241, 0.06)', borderRadius: '10px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                {['Data Fetch', 'Case Filter', 'Scoring', 'Capacity', 'Bundling', 'Tech Selection', 'Route Optimization', 'Time Slotting', 'Email Report'].map((step, i) => (
                  <React.Fragment key={step}>
                    <span style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', whiteSpace: 'nowrap' }}>
                      {i + 1}. {step}
                    </span>
                    {i < 8 && <ArrowRight size={14} style={{ color: '#4f46e5', flexShrink: 0 }} />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Step 1: Data Sourcing */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <Database size={18} color="#3b82f6" />
              <div>
                <h3 style={sectionTitle}>Step 1 — Data Sourcing</h3>
                <p style={sectionSubtitle}>Where the data comes from</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 16px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>RTS Cases</span>
                <span>Maximo REST API → Work Orders where <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>woclass=&apos;WORKORDER&apos;</code> and <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>status=&apos;NEWWO&apos;</code></span>
                
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Case Filtering</span>
                <span>Only WOs whose <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>origrecordid</code> matches a STAGE6 or STAGE6B Service Request ticket ID</span>
                
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Scheduled ARs</span>
                <span>Maximo → <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>WOADDITIONALRESOURCE</code> table filtered to non-&apos;None&apos; status with a SCHEDSTART</span>
                
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Technicians</span>
                <span>SQL → <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>PERSON</code> table joined with <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>PHONE</code> where persongroup = &apos;O&amp;M FIELD SERV&apos; and status = &apos;ACTIVE&apos;</span>
                
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Regions</span>
                <span>SQL → <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>LOCATIONS.REGION</code> joined on work order location code</span>
                
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Addresses</span>
                <span>SQL → <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>SERVICEADDRESS</code> joined via <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>LOCATIONS.SADDRESSCODE</code> (authoritative, not from WO)</span>
              </div>
            </div>
          </div>

          {/* Step 2: Scoring */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <BarChart3 size={18} color="#f59e0b" />
              <div>
                <h3 style={sectionTitle}>Step 2 — Priority Scoring</h3>
                <p style={sectionSubtitle}>How each case gets a composite score for ranking</p>
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 12px' }}>Each work order receives a <strong>dynamic priority score</strong> (0–100) calculated from multiple weighted factors:</p>
              <div style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: '10px', padding: '16px', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.9 }}>
                <div><span style={{ color: '#94a3b8' }}>// Base score from priority level</span></div>
                <div>baseScore = <span style={{ color: '#f59e0b' }}>config.priorityScores[level].baseScore</span></div>
                <div style={{ marginTop: '8px' }}><span style={{ color: '#94a3b8' }}>// Aging bonus: cases get more urgent as SLA deadline approaches</span></div>
                <div>hoursElapsed = now - statusDate</div>
                <div>agingRatio = hoursElapsed / responseWindow</div>
                <div>agingBonus = min(agingRatio × 30, 30)</div>
                <div style={{ marginTop: '8px' }}><span style={{ color: '#94a3b8' }}>// Cluster bonus: reward co-located cases</span></div>
                <div>clusterBonus = min(colocatedCount × <span style={{ color: '#f59e0b' }}>pointsPerColocated</span>, <span style={{ color: '#f59e0b' }}>maxClusterBonus</span>)</div>
                <div style={{ marginTop: '8px' }}><span style={{ color: '#94a3b8' }}>// Final score (capped at 100)</span></div>
                <div><strong style={{ color: '#10b981' }}>score = min(baseScore + agingBonus + clusterBonus, 100)</strong></div>
              </div>
              <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Cases are sorted by score descending. Higher-scored cases get scheduled first, ensuring emergencies and aging SLAs are prioritized.</p>
            </div>
          </div>

          {/* Step 3: Capacity & Selection */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <Users size={18} color="#10b981" />
              <div>
                <h3 style={sectionTitle}>Step 3 — Regional Capacity Planning</h3>
                <p style={sectionSubtitle}>How many cases each region can handle</p>
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 12px' }}>The scheduler calculates <strong>regional capacity</strong> to avoid over-booking:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '6px', fontSize: '0.8rem' }}>CAPACITY FORMULA</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>regionHours = techCount × (businessEnd − businessStart)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>e.g., 4 techs × 12hrs = 48 available hours</div>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '6px', fontSize: '0.8rem' }}>SELECTION</div>
                  <div style={{ fontSize: '0.8rem' }}>Cases are added to the pool in priority order until regional capacity is filled. Excess cases remain unscheduled.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4: Bundling */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <MapPin size={18} color="#ef4444" />
              <div>
                <h3 style={sectionTitle}>Step 4 — Site Bundling (VRP)</h3>
                <p style={sectionSubtitle}>Co-located cases are grouped into bundles</p>
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 12px' }}>Cases at the <strong>same address</strong> are bundled together so a tech handles all work at one site before driving to the next:</p>
              <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 2 }}>
                <li>Bundles are formed by matching <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>projectAddress</code> within each region</li>
                <li>STAGE6B &quot;bundle-only&quot; cases are tagged and only scheduled if a STAGE6 case at the same location gets assigned</li>
                <li>Bundle duration = sum of all case durations at that site</li>
              </ul>
            </div>
          </div>

          {/* Step 5: Tech Selection */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <Users size={18} color="#6366f1" />
              <div>
                <h3 style={sectionTitle}>Step 5 — Load-Balanced Tech Selection</h3>
                <p style={sectionSubtitle}>How bundles are assigned to technicians</p>
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 12px' }}>For each bundle, the scheduler evaluates all techs in that region:</p>
              <div style={{ background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: '10px', padding: '16px', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.9 }}>
                <div><span style={{ color: '#94a3b8' }}>// For each tech in the region:</span></div>
                <div>driveTime = Google Maps API(tech.currentLocation → site)</div>
                <div style={{ marginTop: '8px' }}><span style={{ color: '#94a3b8' }}>// Load-balance: penalize busy techs</span></div>
                <div><strong style={{ color: '#818cf8' }}>score = driveTime + (existingAssignments × 20 min)</strong></div>
                <div style={{ marginTop: '8px' }}><span style={{ color: '#94a3b8' }}>// Tech with the lowest score wins</span></div>
                <div>bestTech = min(score) where usedMinutes + bundleDuration &lt; 660</div>
              </div>
              <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>The 20-min penalty per existing assignment ensures work spreads across techs. A tech with 3 jobs needs to be 60+ minutes closer to beat an idle tech.</p>
            </div>
          </div>

          {/* Step 6: Route Optimization */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <Route size={18} color="#f97316" />
              <div>
                <h3 style={sectionTitle}>Step 6 — Route Optimization</h3>
                <p style={sectionSubtitle}>Backwards Nearest Neighbor heuristic</p>
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 12px' }}>Once bundles are assigned to techs, the route order is optimized:</p>
              <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 2.2 }}>
                <li><strong>Find the closest site to home</strong> — this becomes the <em>last</em> appointment (shortest drive home at end of day)</li>
                <li><strong>Build route backwards</strong> — from the last site, find the nearest unvisited site, repeat until all sites are chained</li>
                <li><strong>Reverse the chain</strong> — produces a forward route: home → farthest first → spiral inward → closest last → home</li>
                <li><strong>Time-slot each stop</strong> — starting from business start (6 AM), add drive time + job duration sequentially</li>
                <li><strong>Constraint check</strong> — verify the tech can complete the last job + drive home before business end (6 PM)</li>
              </ol>
            </div>
          </div>

          {/* Step 7: Overflow */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <Layers size={18} color="#ec4899" />
              <div>
                <h3 style={sectionTitle}>Step 7 — Overflow Assignment</h3>
                <p style={sectionSubtitle}>Filling empty tech schedules</p>
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 8px' }}>After the main VRP pass, any tech with <strong>zero assignments</strong> for the target day gets a second pass:</p>
              <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 2 }}>
                <li>Only considers unassigned cases from the <strong>same region</strong></li>
                <li>Uses a greedy nearest-first approach from the tech&apos;s home</li>
                <li>Respects the same business hours and max drive time ({config.scheduling.maxDriveMinutes} min) constraints</li>
              </ul>
            </div>
          </div>

          {/* Step 8: Email */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <Mail size={18} color="#14b8a6" />
              <div>
                <h3 style={sectionTitle}>Step 8 — Email Report</h3>
                <p style={sectionSubtitle}>What gets emailed and how</p>
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 8px' }}>The email report merges <strong>two sources</strong>:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div style={{ background: 'rgba(20, 184, 166, 0.06)', border: '1px solid rgba(20, 184, 166, 0.15)', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontWeight: 700, color: '#14b8a6', marginBottom: '4px', fontSize: '0.8rem' }}>AUTO-SCHEDULED</div>
                  <div style={{ fontSize: '0.8rem' }}>Appointments created by this tool (tagged <code style={{ color: '#f59e0b' }}>_autoScheduled</code>)</div>
                </div>
                <div style={{ background: 'rgba(20, 184, 166, 0.06)', border: '1px solid rgba(20, 184, 166, 0.15)', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontWeight: 700, color: '#14b8a6', marginBottom: '4px', fontSize: '0.8rem' }}>MAXIMO ARs</div>
                  <div style={{ fontSize: '0.8rem' }}>Pre-existing appointments whose SCHEDSTART matches the target date</div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>CSV attachment includes: Work Order, Case #, Title, Case Type, Priority, Score, Region, Project, Address, Technician, Scheduled Date, Start Time, Duration, Travel To/From, Status, and Source column.</p>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
