"use client";

import React, { useState, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { Technician, WorkOrder } from '@/data/mockData';


function TimelineSlot({ techId, dateStr, timeHour, rowHeight, children, isOutsideBusinessHours }: any) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${techId}-${dateStr}-${timeHour}`,
    data: { techId, dateStr, timeHour }
  });

  return (
    <div 
      ref={setNodeRef}
      style={{ 
        height: '100%',
        minHeight: `${rowHeight}px`,
        flex: 1, 
        minWidth: '20px', 
        borderRight: '1px solid var(--border-color)', 
        backgroundColor: isOver ? 'rgba(59, 130, 246, 0.1)' : isOutsideBusinessHours ? 'rgba(0,0,0,0.05)' : 'transparent',
        outline: isOver ? '2px dashed var(--primary)' : 'none',
        outlineOffset: '-2px',
        position: 'relative',
        boxSizing: 'border-box'
      }}
    >
      {children}
    </div>
  );
}

function ScheduledBlock({ order, origin, gapMins, returnHome, trackIndex = 0, onUnschedule, onClick }: { order: WorkOrder, origin: string, gapMins: number, returnHome?: string, trackIndex?: number, onUnschedule: (id: string) => void, onClick?: () => void }) {
   const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: order.id,
    data: order
  });

  const widthPercentage = order.durationHours * 100;
  
  const [travelMins, setTravelMins] = useState<number | null>(null);
  const [returnMins, setReturnMins] = useState<number | null>(null);

  // Consider address incomplete if it lacks numbers or is very short (e.g. just a state code)
  const isIncomplete = !order.projectAddress || !/\d/.test(order.projectAddress) || order.projectAddress.length <= 3;

  useEffect(() => {
     if (isIncomplete) return;
     
     fetch('/api/distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: origin, destination: order.projectAddress || order.projectName })
     })
     .then(res => res.json())
     .then(data => {
        if (data && typeof data.minutes === 'number') {
           setTravelMins(data.minutes);
        }
     })
     .catch(e => setTravelMins(45));
  }, [origin, order.id]);

  useEffect(() => {
     if (isIncomplete) return;
     if (returnHome) {
         fetch('/api/distance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: order.projectAddress || order.projectName, destination: returnHome })
         })
         .then(res => res.json())
         .then(data => {
            if (data && typeof data.minutes === 'number') {
               setReturnMins(data.minutes);
            }
         })
         .catch(e => setReturnMins(45));
     }
  }, [returnHome, order.id]);

  const displayTravelMins = travelMins ?? 0;
  const travelPct = ((displayTravelMins / 60) / order.durationHours) * 100;
  
  const displayReturnMins = returnMins ?? 0;
  const returnPct = returnMins ? ((displayReturnMins / 60) / order.durationHours) * 100 : 0;
  
  const isOverlap = travelMins !== null && gapMins < travelMins;

  const handleRightClick = (e: React.MouseEvent) => {
     e.preventDefault();
     if (window.confirm(`Unschedule ${order.title}?`)) {
        onUnschedule(order.id);
     }
  };

  return (
    <div 
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onContextMenu={handleRightClick}
      style={{
        position: 'absolute',
        top: `${4 + (trackIndex * 56)}px`,
        left: '2px', 
        width: `calc(${widthPercentage}% - 4px)`,
        height: '52px',
        margin: 0,
        zIndex: isDragging ? 30 : 10,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {/* Travel dash line before block */}
      {travelMins !== null && (
        <div style={{
            position: 'absolute',
            left: `-${travelPct}%`,
            top: '24px',
            width: `${travelPct}%`,
            height: '4px',
            borderTop: `3px dashed ${isOverlap ? 'red' : '#94a3b8'}`,
            zIndex: isOverlap ? 40 : -1,
            pointerEvents: 'none'
        }}>
           <span style={{ position: 'absolute', top: '-18px', left: '2px', fontSize: '0.65rem', color: isOverlap ? 'red' : '#94a3b8', whiteSpace: 'nowrap', fontWeight: isOverlap ? 600 : 'normal' }}>
             {travelMins}m {isOverlap && '(Overlap!)'}
           </span>
        </div>
      )}

      {/* Return home dashed line directly after logic block */}
      {returnMins !== null && (
        <div style={{
            position: 'absolute',
            right: `-${returnPct}%`,
            top: '24px',
            width: `${returnPct}%`,
            height: '4px',
            borderTop: `3px dashed #10b981`,
            zIndex: -1,
            pointerEvents: 'none'
        }}>
           <span style={{ position: 'absolute', top: '-18px', left: '0', fontSize: '0.65rem', color: '#10b981', whiteSpace: 'nowrap', fontWeight: 600 }}>
             {returnMins}m
           </span>
        </div>
      )}

      <div 
         className={`rts-card`} 
         onClick={onClick}
         title={`${order.title}\nProject: ${order.projectName}\nCase Type: ${order.caseType}\nRegion: ${order.region}\nPriority Level: ${order.reportedPriorityText}\nScore: ${order.priority}\nDuration: ${order.durationHours}hr\nStatus: ${order.status}${travelMins !== null ? `\nTravel To: ${travelMins} min` : ''}${returnMins !== null ? `\nTravel From: ${returnMins} min` : ''}`}
         style={{ 
            width: '100%', 
            height: '100%', 
            padding: '8px', 
            cursor: 'grab', 
            position: 'relative', 
            borderLeft: `6px solid ${
               order.status === 'Completed' ? '#10b981' : 
               order.status === 'Checked Out' ? '#3b82f6' : 
               order.status === 'In Progress' ? '#f97316' : '#eab308'
            }`,
            backgroundColor: 'var(--surface-color)'
         }}
      >
         <div className="priority-indicator"></div>
         <div style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {order.title}
         </div>
         <div style={{ fontSize: '0.65rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {order.caseType} {(order.status === 'In Progress' || order.status === 'Checked Out') && <span style={{ color: 'var(--primary)' }}>(Checked In)</span>}
         </div>
      </div>
    </div>
  );
}

function TimezoneGroup({ tz, techs, dates, scheduledOrders, onUnschedule, onBlockClick }: any) {
   const [localTimeString, setLocalTimeString] = useState<string>('');
   const [currentTimeRatio, setCurrentTimeRatio] = useState<number | null>(null);

   useEffect(() => {
     const updateTime = () => {
       try {
         const nowStr = new Date().toLocaleString("en-US", {timeZone: tz});
         const tzDate = new Date(nowStr);
         
         setLocalTimeString(tzDate.toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit', hour12: true }));

         const hours = tzDate.getHours();
         const minutes = tzDate.getMinutes();
         
         const ratio = ((hours * 60 + minutes) / (24 * 60 * dates.length)) * 100;
         setCurrentTimeRatio(ratio);
       } catch (e) {
         // Invalid timezone catch
       }
     };
     
     updateTime();
     const int = setInterval(updateTime, 60000);
     return () => clearInterval(int);
   }, [tz, dates.length]);

   // Duplicate limits dynamically down to explicitly map rows organically.
   let hoursList = Array.from({ length: 24 }).map((_, i) => i);
   if (dates.length >= 7) {
      hoursList = Array.from({ length: 12 }).map((_, i) => i + 6);
   }

   return (
     <div style={{ position: 'relative', marginBottom: '24px' }}>
        <div style={{ padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.05)', fontWeight: 600, borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
           <span>Timezone: {tz}</span>
           <span style={{ color: 'var(--primary)' }}>{localTimeString}</span>
        </div>
        
        {currentTimeRatio !== null && currentTimeRatio < 100 && (
          <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `calc(200px + (100% - 200px) * (${currentTimeRatio} / 100))`, 
            width: '2px',
            backgroundColor: 'red',
            zIndex: 15,
            pointerEvents: 'none',
            boxShadow: '0 0 8px red'
          }} />
        )}

        {techs.map((tech: Technician) => {
          
           let maxTracksForTech = 1;
           const techDaysData = dates.map((date: Date, di: number) => {
                 const dateStr = date.toISOString().split('T')[0];
                 
                 const todaysOrdersForTech = scheduledOrders
                    .filter((o: WorkOrder) => {
                       if (!o.startTime || o.assignedTechId !== tech.id) return false;
                       const d = new Date(o.checkInTime || o.startTime);
                       const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                       return localDateStr === dateStr;
                    })
                    .sort((a: WorkOrder, b: WorkOrder) => {
                       const aStart = new Date(a.checkInTime || a.startTime!).getTime();
                       const bStart = new Date(b.checkInTime || b.startTime!).getTime();
                       return aStart - bStart;
                    });
                    
                 const orderContextMap = new Map();
                 const tracks: { end: number }[] = [];

                 for (let i = 0; i < todaysOrdersForTech.length; i++) {
                     const order = todaysOrdersForTech[i];
                     const origin = i === 0 ? tech.homeAddress : (todaysOrdersForTech[i-1].projectAddress || todaysOrdersForTech[i-1].projectName || tech.homeAddress);
                     let gapMins = 9999;
                     const targetReturnHome = (i === todaysOrdersForTech.length - 1) ? tech.homeAddress : undefined;
                     
                     const currStart = new Date(order.checkInTime || order.startTime!).getTime();
                     const currEnd = currStart + order.durationHours * 3600000;

                     if (i > 0) {
                         const prevOrder = todaysOrdersForTech[i-1];
                         const prevEnd = new Date(prevOrder.checkInTime || prevOrder.startTime!).getTime() + prevOrder.durationHours * 3600000;
                         gapMins = (currStart - prevEnd) / 60000;
                     }

                     // Find first available vertical track that doesn't overlap
                     let trackIndex = 0;
                     while (trackIndex < tracks.length && tracks[trackIndex].end > currStart) {
                         trackIndex++;
                     }
                     if (trackIndex >= tracks.length) {
                         tracks.push({ end: currEnd });
                     } else {
                         tracks[trackIndex].end = currEnd;
                     }

                     orderContextMap.set(order.id, { origin, gapMins, targetReturnHome, trackIndex });
                 }
                 
                 maxTracksForTech = Math.max(maxTracksForTech, tracks.length);
                 return { dateStr, todaysOrdersForTech, orderContextMap };
           });
           
           const rowHeight = Math.max(60, 60 + (maxTracksForTech - 1) * 56);

           return (
            <div key={tech.id} style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border-color)' }}>
               <div style={{ width: '240px', minWidth: '240px', maxWidth: '240px', flexShrink: 0, backgroundColor: 'var(--surface-color)', padding: '16px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                 <div style={{ fontWeight: 600 }}>{tech.name}</div>
                 <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tech.homeAddress}</div>
               </div>
               
               {techDaysData.map(({ dateStr, todaysOrdersForTech, orderContextMap }: any, di: number) => {
                 return (
                 <div key={di} style={{ display: 'flex', flex: 1, alignItems: 'stretch' }}>
                    {hoursList.map(hour => {
                       // Find ALL orders that start in this specific hour slot
                       const ordersInSlot = todaysOrdersForTech.filter((o: WorkOrder) => {
                          const dAnchor = new Date(o.checkInTime || o.startTime!);
                          return dAnchor.getHours() === hour;
                       });

                       const isOut = hour < 6 || hour >= 18;

                       return (
                             <TimelineSlot key={`${dateStr}-${hour}`} techId={tech.id} dateStr={dateStr} timeHour={hour} rowHeight={rowHeight} isOutsideBusinessHours={isOut}>
                                 {ordersInSlot.map((orderInSlot: WorkOrder) => {
                                     const context = orderContextMap.get(orderInSlot.id);
                                     if (!context) return null;
                                     return <ScheduledBlock key={orderInSlot.id} order={orderInSlot} origin={context.origin} gapMins={context.gapMins} returnHome={context.targetReturnHome} trackIndex={context.trackIndex} onUnschedule={onUnschedule} onClick={() => onBlockClick(orderInSlot)} />;
                                 })}
                             </TimelineSlot>
                       );
                    })}
                 </div>
                 );
              })}
           </div>
          );
        })}
     </div>
   );
}

export default function GanttTimeline({ days, offsetDays = 0, technicians, scheduledOrders, onUnschedule, onStatusChange }: { days: number, offsetDays?: number, technicians: Technician[], scheduledOrders: WorkOrder[], onUnschedule: (id: string) => void, onStatusChange?: (id: string, newStatus: string) => void }) {
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const today = new Date();
  
  // Calculate Target Offset natively
  const dates = Array.from({ length: days }).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i + offsetDays);
    return d;
  });

  // Dynamic Hour Boundaries natively parsing week spans
  let hoursList = Array.from({ length: 24 }).map((_, i) => i);
  if (days >= 7) {
     hoursList = Array.from({ length: 12 }).map((_, i) => i + 6); // 6 AM strictly to 5:59 PM (17)
  }
  
  // Group techs by Region
  const regionGroups = technicians.reduce((acc, tech) => {
    if (!acc[tech.region]) acc[tech.region] = [];
    acc[tech.region].push(tech);
    return acc;
  }, {} as Record<string, Technician[]>);

  const sortedRegions = Object.keys(regionGroups).sort();

  return (
    <div style={{ backgroundColor: 'var(--surface-color)', borderRadius: '12px', border: '1px solid var(--border-color)', overflowY: 'auto', overflowX: 'auto', height: 'calc(100vh - 120px)', paddingBottom: '24px' }}>
       {/* Sticky Header Layer physically bypassing vertical overflow */}
       <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 100, backgroundColor: 'var(--surface-color)', alignSelf: 'flex-start' }}>
         <div style={{ width: '240px', minWidth: '240px', maxWidth: '240px', flexShrink: 0, backgroundColor: 'var(--surface-color)', padding: '16px', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
            Technician
         </div>
         {dates.map((date, i) => (
           <div key={i} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
             <div style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', fontWeight: 600 }}>
                {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
             </div>
             <div style={{ display: 'flex', flex: 1 }}>
                {hoursList.map(hour => (
                  <div key={hour} style={{ flex: 1, minWidth: '24px', textAlign: 'center', padding: '4px 0', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                     {hour % 12 === 0 ? 12 : hour % 12}{hour >= 12 ? 'pm' : 'am'}
                  </div>
                ))}
             </div>
           </div>
         ))}
       </div>

       {/* Render each Region Group */}
       {sortedRegions.map(region => {
           const regionTechs = regionGroups[region];
           
           // Group regional techs by strictly timezone
           const tzGroups = regionTechs.reduce((acc, tech) => {
              if (!acc[tech.timezone]) acc[tech.timezone] = [];
              acc[tech.timezone].push(tech);
              return acc;
           }, {} as Record<string, Technician[]>);
           
           return (
              <div key={region}>
                 <div style={{ position: 'sticky', top: '56px', zIndex: 90, padding: '12px 16px', backgroundColor: '#eef2ff', fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', borderBottom: '1px solid var(--border-color)' }}>
                    {region} Region
                 </div>
                 {/* Render Timezones sequentially beneath the region */}
                 {Object.entries(tzGroups).sort().map(([tz, techs]) => (
                    <TimezoneGroup key={`${region}-${tz}`} tz={tz} techs={techs} dates={dates} scheduledOrders={scheduledOrders} onUnschedule={onUnschedule} onBlockClick={setSelectedOrder} />
                 ))}
              </div>
           );
       })}

       {/* Order Details Modal */}
       {selectedOrder && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ backgroundColor: 'var(--surface-color)', padding: '24px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
               <h2 style={{ marginTop: 0, marginBottom: '8px', color: 'var(--primary)' }}>Appointment Details</h2>
               <div style={{ marginBottom: '16px', fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-main)' }}>{selectedOrder.title}</div>
               
               <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', marginBottom: '24px', fontSize: '0.9rem' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Project:</div>
                  <div style={{ color: 'var(--text-main)' }}>{selectedOrder.projectName}</div>
                  
                  <div style={{ color: 'var(--text-muted)' }}>Address:</div>
                  <div style={{ color: 'var(--text-main)' }}>{selectedOrder.projectAddress}</div>
                  
                  <div style={{ color: 'var(--text-muted)' }}>Work Type:</div>
                  <div style={{ color: 'var(--text-main)' }}>{selectedOrder.caseType}</div>
                  
                  <div style={{ color: 'var(--text-muted)' }}>Duration:</div>
                  <div style={{ color: 'var(--text-main)' }}>{selectedOrder.durationHours} Hours</div>
                  
                  <div style={{ color: 'var(--text-muted)' }}>Start Time:</div>
                  <div style={{ color: 'var(--text-main)' }}>{new Date(selectedOrder.startTime || '').toLocaleString()}</div>
                  
                  {selectedOrder.travelToMins != null && (
                    <>
                      <div style={{ color: 'var(--text-muted)' }}>Travel To:</div>
                      <div style={{ color: '#94a3b8' }}>{selectedOrder.travelToMins} min</div>
                    </>
                  )}
               </div>

               <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Update Status</label>
                  <select 
                     value={selectedOrder.status || 'Scheduled'} 
                     onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'None') {
                           onUnschedule(selectedOrder.id);
                           setSelectedOrder(null);
                        } else {
                           if (onStatusChange) onStatusChange(selectedOrder.id, val);
                           setSelectedOrder({ ...selectedOrder, status: val });
                        }
                     }}
                     style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-main)' }}
                  >
                     <option value="None">None (Unschedule)</option>
                     <option value="Scheduled">Scheduled</option>
                     <option value="In Progress">In Progress</option>
                     <option value="Checked Out">Checked Out</option>
                     <option value="Completed">Completed</option>
                  </select>
               </div>

               <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setSelectedOrder(null)} className="btn btn-primary" style={{ padding: '8px 16px' }}>Close</button>
               </div>
            </div>
         </div>
       )}
    </div>
  );
}
