'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, RotateCcw, Save, Clock, Zap, Layers, Truck, CheckCircle, Star, Plus, X } from 'lucide-react';

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

// ─── Component ──────────────────────────────────────────────────────────────

export default function ScorecardConfigTab() {
  const [config, setConfig] = useState<SchedulerConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setConfig(getSchedulerConfig());
    setMounted(true);
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {(['topTier', 'midTier'] as const).map(tier => {
              const label = tier === 'topTier' ? 'Top Tier (+20 pts)' : 'Mid Tier (+15 pts)';
              const color = tier === 'topTier' ? '#f59e0b' : '#3b82f6';
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
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <input
                      type="text"
                      placeholder="Add customer code..."
                      id={`vip-input-${tier}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value.trim().toUpperCase();
                          if (val && !config.vipCustomers[tier].includes(val)) {
                            setConfig(prev => ({
                              ...prev,
                              vipCustomers: {
                                ...prev.vipCustomers,
                                [tier]: [...prev.vipCustomers[tier], val]
                              }
                            }));
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                      style={{ ...inputStyle, flex: 1, fontSize: '0.8rem' }}
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById(`vip-input-${tier}`) as HTMLInputElement;
                        const val = input?.value.trim().toUpperCase();
                        if (val && !config.vipCustomers[tier].includes(val)) {
                          setConfig(prev => ({
                            ...prev,
                            vipCustomers: {
                              ...prev.vipCustomers,
                              [tier]: [...prev.vipCustomers[tier], val]
                            }
                          }));
                          if (input) input.value = '';
                        }
                      }}
                      style={{
                        ...btnBase, padding: '6px 12px', fontSize: '0.78rem',
                        backgroundColor: `${color}22`, border: `1px solid ${color}44`, color
                      }}
                    >
                      <Plus size={14} /> Add
                    </button>
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
    </div>
  );
}
