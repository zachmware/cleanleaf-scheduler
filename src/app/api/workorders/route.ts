import { NextResponse } from 'next/server';

export const revalidate = 300; // Cache the Maximo response for 5 minutes

function processRawRecords(members: any[], clusterMap: Map<string, number>, isScheduled: boolean, assignments?: any[]) {
    const rawRecords = members.map((wo: any) => {
        const addr = (wo['spi:woserviceaddress'] && wo['spi:woserviceaddress'][0]) || {};
        const locNode = (wo['spi:locations'] && wo['spi:locations'][0]) || {};
        const explicitMboRegion = wo._explicitMboRegion;
        
        const rawDesc = wo['spi:description'] || `Work Order ${wo['spi:wonum']}`;
        const cleanDesc = rawDesc.replace(/\[.*?\]/g, '').trim();
        
        return {
            id: wo['spi:wonum'],
            title: cleanDesc,
            worktype: wo['spi:worktype'] || 'CM',
            ticketid: wo['spi:origrecordid'] || 'N/A',
            customworktype: wo['spi:jobtype_description'] || 'O&M', 
            ticketPriority: wo['spi:wopriority'] || 3,
            urgency: 3, 
            statusdate: wo['spi:statusdate'] || new Date().toISOString(),
            customer: wo['spi:client'] || wo['spi:vendor'] || 'Unknown Client', 
            location: wo['spi:location'] || 'UNKNOWN',
            projectName: addr['spi:description'] || wo['spi:location'] || 'Unknown Project',
            explicitRegion: explicitMboRegion || locNode['spi:region'] || ((addr['spi:stateprovince'] || '').toUpperCase() === 'NC' ? 'Mid-Atlantic' : 'Midwest'), 
            estdur: wo['spi:estdur'] || 2,
            formattedaddress: [addr['spi:streetaddress'], addr['spi:city'], addr['spi:stateprovince']].filter(Boolean).join(', ') || 'Unknown Address', 
            streetaddress: addr['spi:streetaddress'] || 'Unknown',
            city: addr['spi:city'] || 'Unknown',
            stateprovince: addr['spi:stateprovince'] || 'Unknown',
            postalcode: addr['spi:postalcode'] || 'Unknown'
        };
    });

    const mappedOrders = rawRecords.map((row: any, idx: number) => {
        const priVal = row.ticketPriority || 3;
        let baseScore = 0;
        let expectedResponseHours = 72;
        let pText = 'Medium';
        
        if (priVal == 1 || row.urgency?.toString().toLowerCase().includes('emerg')) { baseScore = 100; expectedResponseHours = 24; pText = 'Emergency'; }
        else if (priVal == 2) { baseScore = 60; expectedResponseHours = 48; pText = 'High'; }
        else if (priVal == 3) { baseScore = 40; expectedResponseHours = 72; pText = 'Medium'; }
        else if (priVal == 4) { baseScore = 20; expectedResponseHours = 96; pText = 'Low'; }
        else { baseScore = 10; expectedResponseHours = 120; pText = 'Advisory'; }

        let slaScore = 0;
        if (row.statusdate) {
            const statusStr = new Date(row.statusdate);
            const deadline = new Date(statusStr.getTime() + (expectedResponseHours * 60 * 60 * 1000));
            const now = new Date();
            if (now > deadline) {
               const daysExceeded = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));
               slaScore = daysExceeded;
            }
        }

        const topTiers = ['VIP1', 'MEGA_CORP']; 
        const midTiers = ['TIER2'];
        let vipScore = 0;
        if (topTiers.includes(row.customer)) vipScore = 20;
        else if (midTiers.includes(row.customer)) vipScore = 15;

        const localCasesCount = clusterMap.get(row.location || 'UNKNOWN') || 1;
        const clusterPointsRaw = localCasesCount * 2; 
        const clusterScore = Math.min(clusterPointsRaw, 15); 

        const finalDynamicScoreRaw = baseScore + slaScore + vipScore + clusterScore;
        const finalDynamicScore = Math.min(finalDynamicScoreRaw, 100);

        const stringAddrNode = [row.streetaddress, row.city, row.stateprovince].filter(Boolean).join(', ');
        const formattedFallback = stringAddrNode ? `${stringAddrNode} ${row.postalcode || ''}`.trim() : null;
        const trueServiceAddress = row.formattedaddress || formattedFallback;

        let strictDuration = row.estdur || 2;
        const targetWType = (row.customworktype || '').toLowerCase();
        if (targetWType.includes('reactive')) strictDuration = 1.5;
        if (targetWType.includes('maintenance')) strictDuration = 6.0;

        let finalStatus = 'RTS';
        let assignedTechId = undefined;
        let startTime = undefined;

        if (isScheduled && assignments) {
            // assignments is an array of MBO records: a.Attributes.WONUM.content
            const assignment = assignments.find((a: any) => a.Attributes?.WONUM?.content === row.id);
            if (assignment) {
                finalStatus = assignment.Attributes?.STATUS?.content || 'Scheduled';
                assignedTechId = assignment.Attributes?.PERSONID?.content;
                startTime = assignment.Attributes?.SCHEDSTART?.content;
                
                if (assignment.Attributes?.SCHEDFINISH && assignment.Attributes?.SCHEDSTART) {
                    const sStart = new Date(assignment.Attributes.SCHEDSTART.content).getTime();
                    const sFinish = new Date(assignment.Attributes.SCHEDFINISH.content).getTime();
                    if (sFinish > sStart) {
                        strictDuration = (sFinish - sStart) / (1000 * 60 * 60);
                    }
                }
            }
        }

        return {
            id: `${row.id}_${idx}`, 
            title: row.title || 'Work Order',
            workType: row.worktype || 'General',
            priority: finalDynamicScore, 
            durationHours: strictDuration, 
            region: row.explicitRegion || 'Midwest', 
            status: finalStatus,
            _isAbsoluteEmergency: baseScore === 100,
            caseNumber: row.ticketid || 'Unknown',
            caseType: row.customworktype || 'Unknown',
            projectName: row.projectName || 'Unknown',
            projectAddress: trueServiceAddress, 
            reportedPriorityText: pText,
            assignedTechId,
            startTime
        };
    });

    mappedOrders.sort((a: any, b: any) => {
         if (a._isAbsoluteEmergency && !b._isAbsoluteEmergency) return -1;
         if (b._isAbsoluteEmergency && !a._isAbsoluteEmergency) return 1;
         return b.priority - a.priority;
    });

    return mappedOrders.map(({ _isAbsoluteEmergency, ...rest }: any) => rest);
}

export async function GET() {
    try {
        const username = process.env.MAXIMO_USER;
        const password = process.env.MAXIMO_PASS;
        if (!username || !password) {
            return NextResponse.json({ error: 'Maximo credentials not configured in .env.local' }, { status: 500 });
        }

        const encodedAuth = Buffer.from(`${username}:${password}`).toString('base64');
        const headers = {
            'Content-Type': 'application/json',
            'maxauth': encodedAuth,
            'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc'
        };
        
        // Helper to batch execute promises so we don't DDOS Maximo
        const executeInBatches = async (tasks: (() => Promise<any>)[], batchSize = 5) => {
             let results: any[] = [];
             for (let i = 0; i < tasks.length; i += batchSize) {
                 const batch = tasks.slice(i, i + batchSize);
                 const batchResults = await Promise.all(batch.map(t => t()));
                 results = results.concat(batchResults);
             }
             return results;
        };

        // 1. Fetch "None" resources (Side RTS)
        // We order by WOADDITIONALRESOURCEID desc to get the most recently created resources
        const sideUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=300&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc`;
        const resSide = await fetch(sideUrl, { method: 'GET', headers, signal: AbortSignal.timeout(20000) });
        let rtsResources: any[] = [];
        if (resSide.ok) {
            const dataSide = await resSide.json();
            const allSide = dataSide.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
            rtsResources = allSide.filter((a: any) => a.Attributes?.STATUS && a.Attributes.STATUS.content === 'None');
        }

        // 2. Fetch "Scheduled" resources (Gantt)
        // We order by SCHEDSTART desc to get the most recently scheduled items
        const schedUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=500&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=SCHEDSTART%20desc`;
        const resSched = await fetch(schedUrl, { method: 'GET', headers, signal: AbortSignal.timeout(20000) });
        let scheduledResources: any[] = [];
        if (resSched.ok) {
            const dataSched = await resSched.json();
            const allSched = dataSched.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
            scheduledResources = allSched.filter((a: any) => a.Attributes?.STATUS && a.Attributes.STATUS.content !== 'None' && a.Attributes.SCHEDSTART);
        }

        // 3. Extract unique WONUMs from both lists
        const rtsWonums = rtsResources.map((a: any) => a.Attributes?.WONUM?.content).filter(Boolean);
        const schedWonums = scheduledResources.map((a: any) => a.Attributes?.WONUM?.content).filter(Boolean);
        const allUniqueWonums = Array.from(new Set([...rtsWonums, ...schedWonums]));

        // 4. Fetch WO Details for those WONUMs via OSLC
        const selectParams = 'wonum,description,worktype,origrecordid,jobtype_description,wopriority,statusdate,client,vendor,location,estdur,woserviceaddress{description,streetaddress,city,stateprovince,postalcode},locations{region}';
        let woDetails: any[] = [];
        
        if (allUniqueWonums.length > 0) {
            const chunkTasks = [];
            for (let i = 0; i < allUniqueWonums.length; i += 30) {
                const chunk = allUniqueWonums.slice(i, i + 30);
                const wonumStr = chunk.map(w => `"${w}"`).join(',');
                const whereClause = encodeURIComponent(`wonum in [${wonumStr}]`);
                const osUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=${whereClause}&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=100`;
                chunkTasks.push(() =>
                    fetch(osUrl, { method: 'GET', headers, signal: AbortSignal.timeout(20000) })
                        .then(r => r.ok ? r.json() : null)
                        .then(data => data ? (data['rdfs:member'] || data.member || []) : [])
                        .catch(() => [])
                );
            }
            const chunkResults = await executeInBatches(chunkTasks, 5);
            for (const res of chunkResults) {
                woDetails = woDetails.concat(res);
            }
        }

        const clusterMap = new Map<string, number>();
        const uniqueLocations = new Set<string>();
        woDetails.forEach((wo: any) => {
             const loc = wo['spi:location'] || 'UNKNOWN';
             clusterMap.set(loc, (clusterMap.get(loc) || 0) + 1);
             if (loc !== 'UNKNOWN') uniqueLocations.add(loc);
        });

        const locationRegionMap = new Map<string, string>();
        if (uniqueLocations.size > 0) {
            const locArray = Array.from(uniqueLocations);
            const locTasks = [];
            for (let i = 0; i < locArray.length; i += 30) {
                const chunk = locArray.slice(i, i + 30).map(c => encodeURIComponent(c)).join(',');
                const locUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/locations?_format=json&location=~in~${chunk}&_inclCol=location,region`;
                locTasks.push(() =>
                    fetch(locUrl, { method: 'GET', headers, signal: AbortSignal.timeout(20000) })
                        .then(r => r.ok ? r.json() : null)
                        .then(data => data ? (data?.LOCATIONSMboSet?.LOCATIONS || []) : [])
                        .catch(() => [])
                );
            }
            const locResults = await executeInBatches(locTasks, 5);
            for (const locs of locResults) {
                locs.forEach((l: any) => {
                     if (l.Attributes?.LOCATION?.content && l.Attributes?.REGION?.content) {
                         locationRegionMap.set(l.Attributes.LOCATION.content, l.Attributes.REGION.content);
                     }
                });
            }
        }
        
        // Inject explicitly resolved MBO Region back into woDetails
        woDetails.forEach((wo: any) => {
             if (wo['spi:location'] && locationRegionMap.has(wo['spi:location'])) {
                 wo._explicitMboRegion = locationRegionMap.get(wo['spi:location']);
             }
        });

        // 5. Separate details back out based on which resource list they came from
        const rtsDetails = woDetails.filter(wo => rtsWonums.includes(wo['spi:wonum']));
        const schedDetails = woDetails.filter(wo => schedWonums.includes(wo['spi:wonum']));

        // 6. Map and process
        const rtsOrders = processRawRecords(rtsDetails, clusterMap, false);
        const scheduledOrders = processRawRecords(schedDetails, clusterMap, true, scheduledResources);

        return NextResponse.json({
            rtsOrders,
            scheduledOrders
        });

    } catch (err: any) {
        return NextResponse.json({ error: 'Database connection failed', details: err.message }, { status: 500 });
    }
}
