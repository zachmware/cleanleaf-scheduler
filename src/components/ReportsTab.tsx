import React, { useState, useMemo, useCallback } from 'react';
import { WorkOrder, Technician } from '@/data/mockData';
import * as XLSX from 'xlsx';
import { BarChart3 } from 'lucide-react';

export default function ReportsTab({ scheduledOrders, technicians }: { scheduledOrders: WorkOrder[], technicians: Technician[] }) {
  const [reportDayOffset, setReportDayOffset] = useState<number>(0);
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [summaryRegions, setSummaryRegions] = useState<string[]>([]);
  
  const today = new Date();
  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() + reportDayOffset);
  const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

  const techMap = new Map(technicians.map(t => [(t.id || '').toLowerCase(), t.name]));

  const dailyOrders = useMemo(() => {
    const filtered = scheduledOrders.filter(o => {
      if (!o.startTime) return false;
      const d = new Date(o.checkInTime || o.startTime);
      const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return localDateStr === targetDateStr;
    });
    filtered.sort((a, b) => {
      const techA = techMap.get((a.assignedTechId || '').toLowerCase()) || a.assignedTechId || 'Unassigned';
      const techB = techMap.get((b.assignedTechId || '').toLowerCase()) || b.assignedTechId || 'Unassigned';
      if (techA !== techB) return techA.localeCompare(techB);
      const timeA = new Date(a.checkInTime || a.startTime!).getTime();
      const timeB = new Date(b.checkInTime || b.startTime!).getTime();
      return timeA - timeB;
    });
    return filtered;
  }, [scheduledOrders, targetDateStr]);

  // All regions available for summary multi-select
  const allSummaryRegions = useMemo(() =>
    [...new Set(dailyOrders.map(o => o.region).filter(Boolean))].sort(),
    [dailyOrders]
  );

  // Initialize summary regions to all on first load
  useMemo(() => {
    if (summaryRegions.length === 0 && allSummaryRegions.length > 0) {
      setSummaryRegions([...allSummaryRegions]);
    }
  }, [allSummaryRegions]);

  // Summary stats filtered by selected regions
  const summaryStats = useMemo(() => {
    const filtered = summaryRegions.length > 0
      ? dailyOrders.filter(o => summaryRegions.includes(o.region || ''))
      : dailyOrders;
    
    const totalAppts = filtered.length;
    const uniqueTechs = new Set(filtered.map(o => o.assignedTechId).filter(Boolean));
    const techCount = uniqueTechs.size;
    const totalPriority = filtered.reduce((s, o) => s + (o.priority || 0), 0);
    const avgPriority = totalAppts > 0 ? totalPriority / totalAppts : 0;
    const avgAptsPerTech = techCount > 0 ? totalAppts / techCount : 0;
    const totalWorkHrs = filtered.reduce((s, o) => s + (o.durationHours || 0), 0);
    const totalTravelMins = filtered.reduce((s, o) => s + ((o as any).travelToMins || 0), 0);
    // Estimate travel from as roughly equal to last leg travel to per tech
    const totalTravelHrs = (totalTravelMins * 2) / 60; // approximate round-trip
    const avgTravelPerTech = techCount > 0 ? totalTravelHrs / techCount : 0;
    const avgWorkPerTech = techCount > 0 ? totalWorkHrs / techCount : 0;

    return { totalAppts, techCount, avgPriority, avgAptsPerTech, totalWorkHrs, totalTravelHrs, avgTravelPerTech, avgWorkPerTech };
  }, [dailyOrders, summaryRegions]);

  const statCard = (value: string, label: string, color: string) => (
    <div style={{
      background: 'rgba(26, 35, 50, 0.6)', borderRadius: '10px', padding: '16px',
      border: '1px solid var(--border-color)', textAlign: 'center', flex: '1 1 120px', minWidth: '120px'
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );

  // Derive unique regions and priorities from the daily orders
  const uniqueRegions = useMemo(() => 
    [...new Set(dailyOrders.map(o => o.region).filter(Boolean))].sort(),
    [dailyOrders]
  );
  const uniquePriorities = useMemo(() => 
    [...new Set(dailyOrders.map(o => o.reportedPriorityText).filter(Boolean))].sort(),
    [dailyOrders]
  );

  // Apply filters
  const filteredOrders = useMemo(() => {
    return dailyOrders.filter(o => {
      if (regionFilter !== 'ALL' && o.region !== regionFilter) return false;
      if (priorityFilter !== 'ALL' && o.reportedPriorityText !== priorityFilter) return false;
      return true;
    });
  }, [dailyOrders, regionFilter, priorityFilter]);

  const formatTime = (isoString?: string) => {
      if (!isoString) return '';
      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const calculateEndTime = (startTime?: string, durationHours = 0) => {
      if (!startTime) return '';
      const d = new Date(startTime);
      d.setMinutes(d.getMinutes() + (durationHours * 60));
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const selectStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--surface-color)',
    color: 'var(--text-main)',
    fontSize: '0.85rem',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '130px'
  };

  const activeFilterCount = (regionFilter !== 'ALL' ? 1 : 0) + (priorityFilter !== 'ALL' ? 1 : 0);

  const exportToXlsx = useCallback(() => {
    const rows = filteredOrders.map(order => ({
      'Tech': techMap.get((order.assignedTechId || '').toLowerCase()) || order.assignedTechId || 'Unassigned',
      'Start Time': formatTime(order.checkInTime || order.startTime),
      'End Time': calculateEndTime(order.checkInTime || order.startTime, order.durationHours),
      'Case Number': order.caseNumber || '',
      'Project': order.projectName || '',
      'Description': order.title || '',
      'Priority': order.reportedPriorityText || `Score: ${order.priority}`,
      'Region': order.region || '',
      'Status': order.status || '',
      'Duration (hrs)': order.durationHours || 0
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    
    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String((r as any)[key] || '').length)) + 2
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    const dayLabel = reportDayOffset === 0 ? 'Today' : 'Tomorrow';
    XLSX.utils.book_append_sheet(wb, ws, `Schedule ${dayLabel}`);

    // Build filename with active filters
    const dateLabel = targetDate.toISOString().split('T')[0];
    const filterParts = [dateLabel];
    if (regionFilter !== 'ALL') filterParts.push(regionFilter.replace(/\s/g, '-'));
    if (priorityFilter !== 'ALL') filterParts.push(priorityFilter);
    const filename = `Schedule_Report_${filterParts.join('_')}.xlsx`;

    XLSX.writeFile(wb, filename);
  }, [filteredOrders, techMap, reportDayOffset, targetDate, regionFilter, priorityFilter]);

  return (
    <div style={{ backgroundColor: 'var(--surface-color)', borderRadius: '12px', border: '1px solid var(--border-color)', height: 'calc(100vh - 120px)', padding: '24px', display: 'flex', flexDirection: 'column' }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
           <h2 style={{ margin: 0, color: 'var(--text-main)' }}>
              Daily Schedule Report - {targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
           </h2>
           <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-color)', padding: '4px', borderRadius: '8px' }}>
              <button 
                onClick={() => setReportDayOffset(0)}
                style={{
                   padding: '6px 16px',
                   borderRadius: '6px',
                   border: 'none',
                   background: reportDayOffset === 0 ? 'var(--primary)' : 'transparent',
                   color: reportDayOffset === 0 ? '#fff' : 'var(--text-muted)',
                   fontWeight: 600,
                   cursor: 'pointer'
                }}
              >
                 Today
              </button>
              <button 
                onClick={() => setReportDayOffset(1)}
                style={{
                   padding: '6px 16px',
                   borderRadius: '6px',
                   border: 'none',
                   background: reportDayOffset === 1 ? 'var(--primary)' : 'transparent',
                   color: reportDayOffset === 1 ? '#fff' : 'var(--text-muted)',
                   fontWeight: 600,
                   cursor: 'pointer'
                }}
              >
                 Tomorrow
              </button>
           </div>
       </div>

       {/* Summary Dashboard */}
       <div style={{
         marginBottom: '16px', padding: '16px',
         background: 'linear-gradient(135deg, rgba(16,185,129,0.04), rgba(59,130,246,0.04))',
         borderRadius: '12px', border: '1px solid var(--border-color)'
       }}>
         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             <BarChart3 size={16} style={{ color: 'var(--primary)' }} />
             <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>Schedule Summary</span>
           </div>
           <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
             {allSummaryRegions.map(region => {
               const isActive = summaryRegions.includes(region);
               return (
                 <button
                   key={region}
                   onClick={() => setSummaryRegions(prev =>
                     isActive ? prev.filter(r => r !== region) : [...prev, region]
                   )}
                   style={{
                     padding: '3px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600,
                     border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border-color)'}`,
                     background: isActive ? 'rgba(16,185,129,0.15)' : 'transparent',
                     color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                     cursor: 'pointer', transition: 'all 0.15s'
                   }}
                 >
                   {region}
                 </button>
               );
             })}
           </div>
         </div>
         <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
           {statCard(String(summaryStats.totalAppts), 'Appointments', '#10b981')}
           {statCard(summaryStats.avgPriority.toFixed(1), 'Avg Priority', '#ec4899')}
           {statCard(summaryStats.avgAptsPerTech.toFixed(1), 'Avg Apts/Tech', '#8b5cf6')}
           {statCard(`${summaryStats.totalTravelHrs.toFixed(1)}h`, 'Total Travel', '#f59e0b')}
           {statCard(`${summaryStats.totalWorkHrs.toFixed(1)}h`, 'Total Work', '#3b82f6')}
           {statCard(`${summaryStats.avgTravelPerTech.toFixed(1)}h`, 'Avg Travel/Tech', '#f97316')}
           {statCard(`${summaryStats.avgWorkPerTech.toFixed(1)}h`, 'Avg Work/Tech', '#06b6d4')}
         </div>
       </div>

       {/* Filter bar */}
       <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Filters:</span>
          
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={selectStyle}>
            <option value="ALL">All Regions</option>
            {uniqueRegions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={selectStyle}>
            <option value="ALL">All Priorities</option>
            {uniquePriorities.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {activeFilterCount > 0 && (
            <button
              onClick={() => { setRegionFilter('ALL'); setPriorityFilter('ALL'); }}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'transparent',
                color: 'var(--primary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Clear filters ({activeFilterCount})
            </button>
          )}

          <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Showing {filteredOrders.length} of {dailyOrders.length} appointments
          </span>

          <button
            onClick={exportToXlsx}
            disabled={filteredOrders.length === 0}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid var(--primary)',
              background: filteredOrders.length === 0 ? 'transparent' : 'var(--primary)',
              color: filteredOrders.length === 0 ? 'var(--text-muted)' : '#fff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: filteredOrders.length === 0 ? 'not-allowed' : 'pointer',
              opacity: filteredOrders.length === 0 ? 0.5 : 1,
              whiteSpace: 'nowrap'
            }}
          >
            ⬇ Export XLSX
          </button>
       </div>

       <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
             <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-color)', zIndex: 10, borderBottom: '2px solid var(--border-color)' }}>
                <tr>
                   <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Tech</th>
                   <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Time</th>
                   <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Case Number</th>
                   <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Project</th>
                   <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Description</th>
                   <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Priority</th>
                   <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Region</th>
                </tr>
             </thead>
             <tbody>
                {filteredOrders.length === 0 ? (
                   <tr>
                      <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {dailyOrders.length === 0 ? 'No appointments scheduled for this day.' : 'No appointments match the current filters.'}
                      </td>
                   </tr>
                ) : (
                   filteredOrders.map(order => (
                      <tr key={order.id} style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
                         <td style={{ padding: '12px 16px', fontWeight: 600 }}>{techMap.get((order.assignedTechId || '').toLowerCase()) || order.assignedTechId || 'Unassigned'}</td>
                         <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            {formatTime(order.checkInTime || order.startTime)} - {calculateEndTime(order.checkInTime || order.startTime, order.durationHours)}
                         </td>
                         <td style={{ padding: '12px 16px' }}>{order.caseNumber}</td>
                         <td style={{ padding: '12px 16px' }}>{order.projectName}</td>
                         <td style={{ padding: '12px 16px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.title}>
                            {order.title}
                         </td>
                         <td style={{ padding: '12px 16px' }}>
                            <span style={{ 
                                background: order.priority > 80 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', 
                                color: order.priority > 80 ? '#ef4444' : '#3b82f6',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '0.8rem',
                                fontWeight: 600
                            }}>
                                {order.reportedPriorityText || `Score: ${order.priority}`}
                            </span>
                         </td>
                         <td style={{ padding: '12px 16px' }}>{order.region}</td>
                      </tr>
                   ))
                )}
             </tbody>
          </table>
       </div>
    </div>
  );
}
