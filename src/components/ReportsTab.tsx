import React, { useState } from 'react';
import { WorkOrder, Technician } from '@/data/mockData';

export default function ReportsTab({ scheduledOrders, technicians }: { scheduledOrders: WorkOrder[], technicians: Technician[] }) {
  const [reportDayOffset, setReportDayOffset] = useState<number>(0); // 0 = today, 1 = tomorrow, etc.
  
  const today = new Date();
  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() + reportDayOffset);
  const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

  const techMap = new Map(technicians.map(t => [(t.id || '').toLowerCase(), t.name]));

  // Filter orders for the selected target day
  const dailyOrders = scheduledOrders.filter(o => {
    if (!o.startTime) return false;
    const d = new Date(o.checkInTime || o.startTime);
    const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return localDateStr === targetDateStr;
  });

  // Sort by tech, then by start time
  dailyOrders.sort((a, b) => {
      const techA = techMap.get((a.assignedTechId || '').toLowerCase()) || a.assignedTechId || 'Unassigned';
      const techB = techMap.get((b.assignedTechId || '').toLowerCase()) || b.assignedTechId || 'Unassigned';
      if (techA !== techB) return techA.localeCompare(techB);
      
      const timeA = new Date(a.checkInTime || a.startTime!).getTime();
      const timeB = new Date(b.checkInTime || b.startTime!).getTime();
      return timeA - timeB;
  });

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

  return (
    <div style={{ backgroundColor: 'var(--surface-color)', borderRadius: '12px', border: '1px solid var(--border-color)', height: 'calc(100vh - 120px)', padding: '24px', display: 'flex', flexDirection: 'column' }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
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
                {dailyOrders.length === 0 ? (
                   <tr>
                      <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No appointments scheduled for this day.</td>
                   </tr>
                ) : (
                   dailyOrders.map(order => (
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
