"use client";

import React, { useState, useRef } from 'react';
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { mockRTSWorkOrders, mockScheduledOrders, WorkOrder, Technician } from '@/data/mockData';
import SidebarRTS from './SidebarRTS';
import GanttTimeline from './GanttTimeline';
import ReportsTab from './ReportsTab';
import { Settings, Play, CalendarDays, RefreshCw, LayoutDashboard, FileText } from 'lucide-react';

export default function SchedulerDashboard() {
  const [rtsOrders, setRtsOrders] = useState<WorkOrder[]>([]);
  const [scheduledOrders, setScheduledOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [viewDays, setViewDays] = useState<number>(2); // Default to 2 days
  const [viewOffsetDays, setViewOffsetDays] = useState<number>(0);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState<boolean>(false);
  const [scheduleProgress, setScheduleProgress] = useState({ current: 0, total: 0, title: '' });
  const [targetDateStr, setTargetDateStr] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [isLoadingDB, setIsLoadingDB] = useState<boolean>(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'gantt' | 'reports'>('gantt');
  const abortScheduling = useRef(false);

  const fetchData = async (isSoftRefresh = false, _retryCount = 0) => {
     if (_retryCount === 0) {
       if (isSoftRefresh) setIsRefreshing(true);
       else setIsLoadingDB(true);
       setDbError(null);
     }

     try {
       const [woRes, techRes] = await Promise.all([
         fetch(`/api/workorders?t=${Date.now()}`),
         fetch(`/api/technicians?t=${Date.now()}`)
       ]);

       const woData = woRes.ok ? await woRes.json() : null;
       const techData = techRes.ok ? await techRes.json() : null;

       // Check if we got meaningful data — if workorders came back empty, retry silently
       const hasRtsData = woData?.rtsOrders?.length > 0;
       const hasSchedData = woData?.scheduledOrders?.length > 0;
       
       if (!hasRtsData && !hasSchedData && _retryCount < 2) {
         console.log(`Data empty on attempt ${_retryCount + 1}, retrying in 1.5s...`);
         await new Promise(r => setTimeout(r, 1500));
         return fetchData(isSoftRefresh, _retryCount + 1);
       }

       if (woData?.rtsOrders) {
         setRtsOrders(woData.rtsOrders);
         setScheduledOrders(woData.scheduledOrders || []);
       } else if (woData && Array.isArray(woData)) {
         setRtsOrders(woData);
       }
       if (techData && Array.isArray(techData)) setTechnicians(techData);
       
       // Clear any previous error
       setDbError(null);
     } catch (e: any) {
       // Retry silently on network errors
       if (_retryCount < 2) {
         console.log(`Fetch error on attempt ${_retryCount + 1}, retrying in 1.5s...`);
         await new Promise(r => setTimeout(r, 1500));
         return fetchData(isSoftRefresh, _retryCount + 1);
       }
       console.error("Failed to connect to Maximo after 3 attempts:", e);
       setDbError(e.message);
     } finally {
       if (_retryCount === 0 || _retryCount >= 2) {
         setIsLoadingDB(false);
         setIsRefreshing(false);
       }
     }
  };

  React.useEffect(() => {
     setIsMounted(true);
     fetchData();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Drag requires moving 5px, allowing normal clicks to pass through
      },
    })
  );

  if (!isMounted) return null; // Hydration boundary explicitly prevents DndKit DOM ID mismatches
  
  const handleDragStart = (event: any) => {
    setActiveDragId(event.active.id as string);
  };

  const handleUnschedule = (orderId: string) => {
     const orderToMove = scheduledOrders.find(o => o.id === orderId);
     if (orderToMove) {
        const revertedOrder: WorkOrder = { ...orderToMove, status: 'RTS' };
        delete revertedOrder.assignedTechId;
        delete revertedOrder.startTime;
        
        setScheduledOrders(prev => prev.filter(o => o.id !== orderId));
        setRtsOrders(prev => [...prev.filter(o => o.id !== orderId), revertedOrder]);
     }
  };

  const handleStatusChange = (orderId: string, newStatus: string) => {
     setScheduledOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    
    const orderId = active.id as string;
    
    // Check if dragging TO the RTS sidebar
    if (over.id === 'rts-sidebar-dropzone') {
       handleUnschedule(orderId);
       return;
    }

    const dropData = over.data.current as { techId: string, timeHour: number, dateStr: string } | undefined;
    
    if (dropData) {
      const orderToMove = rtsOrders.find(o => o.id === orderId) || scheduledOrders.find(o => o.id === orderId);
      if (orderToMove) {
        const hh = dropData.timeHour.toString().padStart(2, '0');
        const exactTimeStr = `${dropData.dateStr}T${hh}:00:00`;
        
        const updatedOrder: WorkOrder = {
          ...orderToMove,
          status: 'SCHEDULED',
          assignedTechId: dropData.techId,
          startTime: exactTimeStr
        };
        
        setRtsOrders(prev => prev.filter(o => o.id !== orderId));
        setScheduledOrders(prev => [...prev.filter(o => o.id !== orderId), updatedOrder]);
      }
    }
  };

  const handleAutoSchedule = async () => {
    setIsScheduling(true);
    setScheduleProgress({ current: 0, total: 0, title: 'Parsing Regional Topology...' });
    
    // Explicitly yield identical thread logic back to React DOM so the Modal physics paint instantly before the Heavy sync loop engages
    await new Promise(resolve => setTimeout(resolve, 50));
    
    let scheduled = [...scheduledOrders];
    let remainingRts = [...rtsOrders].sort((a,b) => b.priority - a.priority); 
    
    // Algorithm strictly maps from 6:00 AM 
    const businessStart = 6;
    const businessEnd = 18;
    const businessHoursPerDay = businessEnd - businessStart;
    
    // 1. Calculate the Regional Capacities for the target day
    const regionalCapacity = new Map<string, number>();
    for (const tech of technicians) {
        const strictRegionKey = (tech.region || 'UNKNOWN').toUpperCase();
        regionalCapacity.set(strictRegionKey, (regionalCapacity.get(strictRegionKey) || 0) + businessHoursPerDay);
    }
    
    // 2. Select optimized sample based on priorities up to mathematical max limit per region
    const targetRTSPool: WorkOrder[] = [];
    const usedRegionalCapacity = new Map<string, number>();
    
    for (const order of remainingRts) {
        const strictOrderRegion = (order.region || 'UNKNOWN').toUpperCase();
        const regionCap = regionalCapacity.get(strictOrderRegion) || 0;
        const used = usedRegionalCapacity.get(strictOrderRegion) || 0;
        
        if (used + order.durationHours <= regionCap) {
            targetRTSPool.push(order);
            usedRegionalCapacity.set(strictOrderRegion, used + order.durationHours);
        }
    }
    
    // 3. Process Only the Select Pool against the specific target date!
    const targetDateObj = new Date(`${targetDateStr}T00:00:00`);
    abortScheduling.current = false;
    
    // ============================================
    // VRP MATHEMATICAL BUNDLER & ROUTING ENGINE
    // ============================================
    // Step A: Formulate Megablocks
    const bundlesByRegion = new Map<string, WorkOrder[][]>();
    for (const order of targetRTSPool) {
        const rKey = (order.region || 'UNKNOWN').toUpperCase();
        if (!bundlesByRegion.has(rKey)) bundlesByRegion.set(rKey, []);
        
        const regionBundles = bundlesByRegion.get(rKey)!;
        const targetAddr = (order.projectAddress || order.projectName || 'UNKNOWN').toUpperCase();
        const existingBundle = regionBundles.find(b => (b[0].projectAddress || b[0].projectName || 'UNKNOWN').toUpperCase() === targetAddr);
        
        if (existingBundle) {
            existingBundle.push(order);
        } else {
            regionBundles.push([order]);
        }
    }

    const distanceCache = new Map<string, number>();
    const getCachedDistance = async (origin: string, destination: string) => {
        const cacheKey = `${origin}|${destination}`;
        if (distanceCache.has(cacheKey)) return distanceCache.get(cacheKey)!;
        try {
            const res = await fetch('/api/distance', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ origin, destination })
            });
            const data = await res.json();
            const mins = data.minutes || 30;
            distanceCache.set(cacheKey, mins);
            return mins;
        } catch (e) {
            distanceCache.set(cacheKey, 30);
            return 30;
        }
    };

    let iteration = 0;
    
    for (const regionKey of bundlesByRegion.keys()) {
        const regionBundles = bundlesByRegion.get(regionKey)!;
        const regionTechs = technicians.filter(t => (t.region || 'UNKNOWN').toUpperCase() === regionKey);
        if (regionTechs.length === 0) continue;

        // Phase 1: Load up tech's day with closest, highest-priority appointments
        const techBundles = new Map<string, WorkOrder[][]>();
        const techUsedMins = new Map<string, number>();
        const techStartStates = new Map<string, { time: Date, location: string }>();
        
        for (const tech of regionTechs) {
            techBundles.set(tech.id, []);
            let techsOrders = scheduled
                  .filter(o => o.assignedTechId === tech.id && o.startTime && (o.checkInTime || o.startTime).split('T')[0] === targetDateStr)
                  .sort((a,b) => new Date(a.checkInTime || a.startTime!).getTime() - new Date(b.checkInTime || b.startTime!).getTime());

            let lastEndTime = new Date(targetDateObj);
            lastEndTime.setHours(businessStart, 0, 0, 0); 
            let originString = tech.homeAddress || 'Midwest';

            if (techsOrders.length > 0) {
                const lastJob = techsOrders[techsOrders.length - 1];
                const lastJobStart = new Date(lastJob.checkInTime || lastJob.startTime!);
                lastEndTime = new Date(lastJobStart.getTime() + (lastJob.durationHours * 60 * 60 * 1000));
                originString = lastJob.projectAddress || lastJob.projectName || tech.homeAddress || 'Midwest';
            }
            
            techStartStates.set(tech.id, { time: lastEndTime, location: originString });
            
            const businessStartTime = new Date(targetDateObj);
            businessStartTime.setHours(businessStart, 0, 0, 0);
            techUsedMins.set(tech.id, (lastEndTime.getTime() - businessStartTime.getTime()) / 60000);
        }
        
        const eveningLimit = new Date(targetDateObj);
        eveningLimit.setHours(businessEnd, 0, 0, 0);

        for (const bundle of regionBundles) {
            if (abortScheduling.current) break;
            const destString = bundle[0].projectAddress || bundle[0].projectName || '';
            const durationMins = bundle.reduce((sum, order) => sum + (order.durationHours * 60), 0);
            
            let bestTech = null;
            let minDrive = 9999;
            
            for (const tech of regionTechs) {
                const currentUsed = techUsedMins.get(tech.id) || 0;
                // Allow up to 11 hours (660 mins) to be safe for drive times
                if (currentUsed + durationMins < 660) {
                    const startLoc = techStartStates.get(tech.id)!.location;
                    const d = await getCachedDistance(startLoc, destString);
                    if (d < minDrive) {
                        minDrive = d;
                        bestTech = tech;
                    }
                }
            }
            
            if (bestTech) {
                techBundles.get(bestTech.id)!.push(bundle);
                techUsedMins.set(bestTech.id, (techUsedMins.get(bestTech.id) || 0) + durationMins + minDrive + 30);
            }
        }

        // Phase 2: Route Optimization - Backwards Nearest Neighbor
        for (const tech of regionTechs) {
            if (abortScheduling.current) break;
            const bundles = techBundles.get(tech.id) || [];
            if (bundles.length === 0) continue;
            
            iteration++;
            setScheduleProgress({ current: iteration, total: targetRTSPool.length, title: `Optimizing Route for ${tech.name}` });
            await new Promise(resolve => setTimeout(resolve, 10));

            // Find closest appointment to be done LAST
            let closestBundleIdx = 0;
            let minHomeDrive = 9999;
            for (let i = 0; i < bundles.length; i++) {
                const dest = bundles[i][0].projectAddress || bundles[i][0].projectName || '';
                const d = await getCachedDistance(tech.homeAddress || 'Midwest', dest);
                if (d < minHomeDrive) { minHomeDrive = d; closestBundleIdx = i; }
            }

            const closestBundle = bundles[closestBundleIdx];
            let unassigned = bundles.filter((_, i) => i !== closestBundleIdx);
            
            let backwardsRoute = [closestBundle];
            let currentLocation = closestBundle[0].projectAddress || closestBundle[0].projectName || '';
            
            // Build backwards route using Nearest Neighbor
            while (unassigned.length > 0) {
                let nearestIdx = 0;
                let nearestDist = 9999;
                for (let i = 0; i < unassigned.length; i++) {
                    const dest = unassigned[i][0].projectAddress || unassigned[i][0].projectName || '';
                    const d = await getCachedDistance(currentLocation, dest);
                    if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
                }
                backwardsRoute.push(unassigned[nearestIdx]);
                currentLocation = unassigned[nearestIdx][0].projectAddress || unassigned[nearestIdx][0].projectName || '';
                unassigned.splice(nearestIdx, 1);
            }
            
            const finalRoute = backwardsRoute.reverse();

            // Formally test and schedule route forwards
            let currentStackTime = techStartStates.get(tech.id)!.time;
            let originString = techStartStates.get(tech.id)!.location;
            
            for (const bundle of finalRoute) {
                const destString = bundle[0].projectAddress || bundle[0].projectName || '';
                const driveToTarget = await getCachedDistance(originString, destString);
                const bundleTotalDurationMins = bundle.reduce((sum, order) => sum + (order.durationHours * 60), 0);
                const driveHome = await getCachedDistance(destString, tech.homeAddress || 'Midwest');
                
                const proposedCheckIn = new Date(currentStackTime.getTime() + (driveToTarget * 60000));
                const proposedCheckOut = new Date(proposedCheckIn.getTime() + (bundleTotalDurationMins * 60000));
                const physicalReturnHomeTime = new Date(proposedCheckOut.getTime() + (driveHome * 60000));
                
                if (physicalReturnHomeTime <= eveningLimit) {
                    for (const order of bundle) {
                        scheduled.push({
                            ...order,
                            status: 'SCHEDULED',
                            assignedTechId: tech.id,
                            startTime: proposedCheckIn.toISOString(),
                            checkInTime: proposedCheckIn.toISOString(),
                        });
                        proposedCheckIn.setTime(proposedCheckIn.getTime() + (order.durationHours * 60000 * 60));
                    }
                    currentStackTime = proposedCheckIn;
                    originString = destString;
                } else {
                    // Skip this job if it fails constraints, but continue checking remaining jobs
                    continue;
                }
            }
            setScheduledOrders([...scheduled]);
        }
    }
    
    const assignedIds = new Set(scheduled.map(o => o.id));
    setScheduledOrders(scheduled);
    setRtsOrders(prev => prev.filter(o => !assignedIds.has(o.id)));
    setIsScheduling(false);
  };
  
  // Find the mocked order for overlay display
  const draggingOrder = rtsOrders.find(o => o.id === activeDragId) || scheduledOrders.find(o => o.id === activeDragId);

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} sensors={sensors}>
      {isScheduling && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
           <div style={{
              backgroundColor: 'var(--surface-color)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--primary)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)', width: '400px', maxWidth: '90%'
           }}>
             <h2 style={{ marginBottom: '16px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '16px', height: '16px', border: '3px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                Auto-Scheduling Engine
             </h2>
             <p style={{ color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.9rem' }}>
                Calculating Google Distance heuristics arrays...
             </p>
             <div style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600, marginBottom: '4px' }}>
                   Analyzing ({scheduleProgress.current} / {scheduleProgress.total})
                </div>
                <div style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                   {scheduleProgress.title}
                </div>
             </div>
             
             {/* Progress Bar Container */}
             <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-color)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ 
                   height: '100%', 
                   width: `${scheduleProgress.total > 0 ? (scheduleProgress.current / scheduleProgress.total) * 100 : 0}%`, 
                   backgroundColor: 'var(--primary)', 
                   transition: 'width 0.2s',
                   boxShadow: '0 0 10px var(--accent-glow)'
                }} />
             </div>
             
             <button 
                className="btn-secondary" 
                style={{ marginTop: '24px', width: '100%', borderColor: 'red', color: '#ff6b6b' }}
                onClick={() => { abortScheduling.current = true; setScheduleProgress(prev => ({ ...prev, title: 'Aborting loop securely...' })) }}
             >
                Abort Sequencing
             </button>
           </div>
           <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <div className="app-container">
        <div className="sidebar">
          {isLoadingDB ? (
            <div style={{ padding: '24px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>Loading Cases...</div>
          ) : (
            <SidebarRTS orders={rtsOrders} />
          )}
        </div>
        
        <div className="main-content">
          <div className="topbar">
            <div className="brand">
              <CalendarDays className="h-6 w-6" style={{ color: 'var(--primary)' }} />
              Cleanleaf Scheduling Tool
            </div>
            
            <div className="topbar-controls">
              {/* Tab Toggle */}
              <div style={{ display: 'flex', background: 'var(--surface-color)', borderRadius: '8px', padding: '4px', gap: '4px', marginRight: '16px' }}>
                 <button 
                   onClick={() => setActiveTab('gantt')}
                   style={{
                     background: activeTab === 'gantt' ? 'var(--primary)' : 'transparent',
                     color: activeTab === 'gantt' ? '#fff' : 'var(--text-muted)',
                     border: 'none',
                     padding: '6px 16px',
                     borderRadius: '6px',
                     cursor: 'pointer',
                     fontWeight: 600,
                     display: 'flex',
                     alignItems: 'center',
                     gap: '6px',
                     transition: 'all 0.2s'
                   }}
                 >
                   <LayoutDashboard size={16} /> Gantt
                 </button>
                 <button 
                   onClick={() => setActiveTab('reports')}
                   style={{
                     background: activeTab === 'reports' ? 'var(--primary)' : 'transparent',
                     color: activeTab === 'reports' ? '#fff' : 'var(--text-muted)',
                     border: 'none',
                     padding: '6px 16px',
                     borderRadius: '6px',
                     cursor: 'pointer',
                     fontWeight: 600,
                     display: 'flex',
                     alignItems: 'center',
                     gap: '6px',
                     transition: 'all 0.2s'
                   }}
                 >
                   <FileText size={16} /> Reports
                 </button>
              </div>

              {/* Day Toggle requested by user */}
              <div style={{ display: 'flex', background: 'var(--surface-color)', borderRadius: '8px', padding: '4px', gap: '4px' }}>
                 {[1, 2, 3, 7].map(days => (
                   <button 
                     key={days}
                     style={{
                       background: viewDays === days ? 'var(--primary)' : 'transparent',
                       color: viewDays === days ? '#fff' : 'var(--text-muted)',
                       border: 'none',
                       padding: '4px 12px',
                       borderRadius: '6px',
                       cursor: 'pointer',
                       fontWeight: 600,
                       fontFamily: 'inherit',
                       transition: 'all 0.2s'
                     }}
                     onClick={() => setViewDays(days)}
                   >
                     {days}D
                   </button>
                 ))}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid var(--border-color)', paddingLeft: '8px' }}>
                 <button onClick={() => setViewOffsetDays(v => v - 1)} style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', padding: '4px 8px' }}>←</button>
                 <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>View Range</span>
                 <button onClick={() => setViewOffsetDays(v => v + 1)} style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', padding: '4px 8px' }}>→</button>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid var(--border-color)', paddingLeft: '8px' }}>
                  <button 
                    onClick={() => fetchData(true)}
                    style={{ 
                        background: 'transparent', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '6px', 
                        cursor: 'pointer', 
                        color: 'var(--text-main)', 
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 600,
                        fontSize: '0.85rem'
                    }}
                  >
                    <RefreshCw className="h-4 w-4" style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                    {isRefreshing ? 'Syncing...' : 'Refresh'}
                  </button>
                  <button onClick={() => setViewOffsetDays(0)} style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', padding: '4px 8px', fontSize: '0.8rem', marginLeft: '4px' }}>Today</button>
               </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid var(--border-color)', paddingLeft: '8px' }}>
                 <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Target Day:</label>
                 <input 
                    type="date" 
                    value={targetDateStr}
                    onChange={(e) => setTargetDateStr(e.target.value)}
                    style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', color: 'var(--text)', padding: '6px 12px', borderRadius: '4px', fontFamily: 'inherit' }}
                 />
              </div>

              <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={18} /> Constraints
              </button>
              <button 
                className={`btn-primary ${isScheduling ? 'opacity-50' : ''}`} 
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={handleAutoSchedule}
                disabled={isScheduling}
              >
                <Play size={18} fill="currentColor" /> {isScheduling ? 'Evaluating Routing...' : 'Auto-Schedule'}
              </button>
            </div>
          </div>
          
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            {dbError && (
               <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#ef4444', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
                 <strong>Maximo Connection Failed:</strong> {dbError}
                 <p style={{ margin: '4px 0 0', fontSize: '0.85rem', opacity: 0.8 }}>Ensure you are connected to the network where sqlprod3.softwrench2.com is hosted, or verify your .env.local credentials.</p>
               </div>
            )}
            
            {isLoadingDB ? (
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', gap: '20px', color: 'var(--text-main)' }}>
                 <div style={{ 
                   width: '48px', height: '48px', 
                   border: '4px solid var(--border-color)', 
                   borderTop: '4px solid var(--primary)', 
                   borderRadius: '50%', 
                   animation: 'spin 1s linear infinite' 
                 }}></div>
                 <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>Please wait while the Maximo query is processed...</p>
                 <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
               </div>
            ) : activeTab === 'gantt' ? (
               <GanttTimeline 
                  days={viewDays} 
                  offsetDays={viewOffsetDays}
                  technicians={technicians} 
                  scheduledOrders={scheduledOrders} 
                  onUnschedule={handleUnschedule}
                  onStatusChange={handleStatusChange}
               />
            ) : (
               <ReportsTab 
                  scheduledOrders={scheduledOrders} 
                  technicians={technicians} 
               />
            )}
          </div>
        </div>
      </div>
      <DragOverlay>
        {draggingOrder ? (
          <div style={{ 
            padding: '12px', 
            background: 'var(--surface-color)', 
            border: '2px solid var(--primary)', 
            color: 'white', 
            borderRadius: '8px', 
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            width: '280px',
            opacity: 0.9,
            cursor: 'grabbing' 
          }}>
             <div style={{ fontWeight: 600 }}>{draggingOrder.title}</div>
             <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{draggingOrder.durationHours} hr • {draggingOrder.workType}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
