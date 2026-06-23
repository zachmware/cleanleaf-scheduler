"use client";

import React, { useState } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { WorkOrder } from '@/data/mockData';
import { GripVertical } from 'lucide-react';

function DraggableWorkOrder({ order }: { order: WorkOrder }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: order.id,
    data: { ...order, type: 'RTS_CARD' } 
  });

  return (
    <div 
      ref={setNodeRef} 
      {...listeners} 
      {...attributes}
      className={`rts-card`}
      style={{ opacity: isDragging ? 0.4 : 1, padding: '12px', borderLeft: order._isAbsoluteEmergency ? '6px solid red' : '6px solid var(--primary)', flexShrink: 0, minHeight: 'fit-content' }}
    >
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ width: '100%' }}>
            <div 
               title={`${order.title}\nProject: ${order.projectName}\nCase Type: ${order.caseType}\nRegion: ${order.region}`}
               style={{ 
                  fontWeight: 700, 
                  fontSize: '0.95rem', 
                  color: order._isAbsoluteEmergency ? 'red' : 'inherit',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
               }}
            >
                {order.title}
            </div>
            
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '8px' }}><strong>Project:</strong> {order.projectName}</span>
              <span style={{ fontWeight: 600, flexShrink: 0 }}>{order.region}</span>
            </div>
            
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>Type:</strong> {order.caseType}</span>
              <span><strong>Pri:</strong> {order.reportedPriorityText}</span>
            </div>

            <div style={{ fontSize: '0.75rem', marginTop: '8px', opacity: 0.7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Case: #{order.caseNumber} • {order.durationHours}hr</span>
              <span style={{ fontWeight: 700, color: 'var(--primary)', opacity: 1, paddingRight: '8px' }}>
                 Score: {order.priority}
              </span>
            </div>
          </div>
          <GripVertical size={16} color="var(--text-muted)" style={{ cursor: 'grab', marginLeft: '8px' }} />
       </div>
    </div>
  );
}

export default function SidebarRTS({ orders }: { orders: WorkOrder[] }) {
  const [searchQ, setSearchQ] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const { setNodeRef, isOver } = useDroppable({
    id: 'rts-sidebar-dropzone',
    data: { isRTSZone: true }
  });

  // Unique buckets for dropdowns natively harvested
  const uniqueRegions = Array.from(new Set(orders.map(o => o.region)));
  const uniqueTypes = Array.from(new Set(orders.map(o => o.caseType))).filter(Boolean);

  // Sort by scheduling score (highest first) then filter
  const sortedOrders = [...orders].sort((a, b) => b.priority - a.priority);
  const filteredOrders = sortedOrders.filter(o => {
      // Free Text Search against Case/Subject
      const searchMatch = !searchQ || 
               o.title.toLowerCase().includes(searchQ.toLowerCase()) || 
               (o.caseNumber || '').toLowerCase().includes(searchQ.toLowerCase());
               
      const regionMatch = regionFilter === 'ALL' || o.region === regionFilter;
      const typeMatch = typeFilter === 'ALL' || o.caseType === typeFilter;
      
      return searchMatch && regionMatch && typeMatch;
  });

  return (
    <div 
      ref={setNodeRef}
      style={{ 
        padding: '24px', 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        backgroundColor: isOver ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
        transition: 'background-color 0.2s'
      }}
    >
      <h2 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Ready to Schedule</h2>
      
      {/* Search / Filter Block */}
      <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
         <input 
            type="text" 
            placeholder="Search by Case No. or Subject..." 
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', color: 'var(--text-main)', outline: 'none' }}
         />
         <div style={{ display: 'flex', gap: '8px' }}>
             <select 
                value={regionFilter} 
                onChange={e => setRegionFilter(e.target.value)}
                style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', color: 'var(--text-main)', outline: 'none' }}
             >
                <option value="ALL">All Regions</option>
                {uniqueRegions.map(r => <option key={r} value={r}>{r}</option>)}
             </select>
             
             <select 
                value={typeFilter} 
                onChange={e => setTypeFilter(e.target.value)}
                style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', color: 'var(--text-main)', outline: 'none' }}
             >
                <option value="ALL">All Case Types</option>
                {uniqueTypes.map(t => <option key={t as string} value={t as string}>{t}</option>)}
             </select>
         </div>
      </div>
      
      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Showing {filteredOrders.length} cases</span>
        <span>Sorted by Priority</span>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredOrders.length === 0 ? (
           <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '2rem' }}>
              No matches found.
           </div>
        ) : (
           filteredOrders.map(order => (
             <DraggableWorkOrder key={order.id} order={order} />
           ))
        )}
      </div>
    </div>
  );
}
