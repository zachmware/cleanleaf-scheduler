import { NextResponse } from 'next/server';

export const revalidate = 0; // Disable cache so Maximo updates are instant
export const maxDuration = 60; // Allow Vercel Hobby serverless to run up to 60s

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

        // 1. Fetch side resources, scheduled resources, and STAGE6 SRs concurrently
        const s0 = Date.now();
        console.log("Starting fetch 1...");
        const [resSide, resSched, resSr] = await Promise.all([
            fetch(`https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=2000&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc`, { method: 'GET', headers, signal: AbortSignal.timeout(20000) }),
            fetch(`https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=2000&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=SCHEDSTART%20desc`, { method: 'GET', headers, signal: AbortSignal.timeout(20000) }),
            fetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=status="STAGE6"&oslc.select=ticketid,status&oslc.pageSize=2000`, { method: 'GET', headers, signal: AbortSignal.timeout(20000) })
        ]);
        console.log(`Fetch 1 complete in ${Date.now() - s0}ms`);

        let allSide: any[] = [];
        let allSched: any[] = [];
        let allSrs: any[] = [];

        if (resSide.ok) {
            const dataSide = await resSide.json();
            allSide = dataSide.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
        }
        if (resSched.ok) {
            const dataSched = await resSched.json();
            allSched = dataSched.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
        }
        if (resSr.ok) {
            const dataSr = await resSr.json();
            allSrs = dataSr['rdfs:member'] || dataSr.member || [];
        }

        // 2. Extract WONUMs
        const rtsResources = allSide.filter((a: any) => a.Attributes?.STATUS && a.Attributes.STATUS.content === 'None');
        const scheduledResources = allSched.filter((a: any) => a.Attributes?.STATUS && a.Attributes.STATUS.content !== 'None' && a.Attributes.SCHEDSTART);

        // 3. Extract unique STAGE6 SRs
        const uniqueSrs = Array.from(new Set(allSrs.map(sr => sr['spi:ticketid']).filter(Boolean)));

        // 4. Fetch WO Details for those SRs where WO status is NEWWO
        const selectParams = 'wonum,status,description,worktype,origrecordid,jobtype_description,wopriority,statusdate,client,vendor,location,estdur,woserviceaddress{description,streetaddress,city,stateprovince,postalcode},locations{region}';
        let woDetails: any[] = [];
        
        console.log(`Unique STAGE6 SRs: ${uniqueSrs.length}`);
        const s1 = Date.now();
        if (uniqueSrs.length > 0) {
            const chunkTasks = [];
            // Batch them in chunks of 150 SRs
            for (let i = 0; i < uniqueSrs.length; i += 150) {
                const chunk = uniqueSrs.slice(i, i + 150);
                const srStr = chunk.map(w => `"${w}"`).join(',');
                const whereClause = encodeURIComponent(`status="NEWWO" and origrecordid in [${srStr}]`);
                const osUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=${whereClause}&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=500`;
                chunkTasks.push(() =>
                    fetch(osUrl, { method: 'GET', headers, signal: AbortSignal.timeout(20000) })
                        .then(r => r.ok ? r.json() : null)
                        .then(data => data ? (data['rdfs:member'] || data.member || []) : [])
                );
            }
            
            // Execute in larger concurrent batches for speed
            const chunkResults = await executeInBatches(chunkTasks, 5);
            for (const res of chunkResults) {
                woDetails = woDetails.concat(res);
            }
        }
        console.log(`Fetch WOs complete in ${Date.now() - s1}ms. Found ${woDetails.length}`);

        // Filter woDetails by RTS/Sched WONUMs and process
        const finalValidWosMap = new Map();
        for (const wo of woDetails) {
            finalValidWosMap.set(wo['spi:wonum'], wo);
        }

        // 5. Process records
        let finalRtsOrders: any[] = [];
        let finalSchedOrders: any[] = [];

        // Cluster Map
        const clusterMap = new Map<string, number>();
        const uniqueLocations = new Set<string>();
        woDetails.forEach((wo: any) => {
             const loc = wo['spi:location'] || 'UNKNOWN';
             clusterMap.set(loc, (clusterMap.get(loc) || 0) + 1);
             if (loc !== 'UNKNOWN') uniqueLocations.add(loc);
        });

        // Build RTS
        for (const res of rtsResources) {
            const wonum = res.Attributes?.WONUM?.content;
            if (wonum && finalValidWosMap.has(wonum)) {
                const wo = finalValidWosMap.get(wonum);
                const processed = processRawRecords([wo], clusterMap, false, rtsResources);
                if (processed.length > 0) finalRtsOrders.push(processed[0]);
                finalValidWosMap.delete(wonum); // prevent dups
            }
        }

        const finalValidWosMapSched = new Map();
        for (const wo of woDetails) {
            finalValidWosMapSched.set(wo['spi:wonum'], wo);
        }

        for (const res of scheduledResources) {
            const wonum = res.Attributes?.WONUM?.content;
            if (wonum && finalValidWosMapSched.has(wonum)) {
                const wo = finalValidWosMapSched.get(wonum);
                const processed = processRawRecords([wo], clusterMap, true, scheduledResources);
                if (processed.length > 0) finalSchedOrders.push(processed[0]);
                finalValidWosMapSched.delete(wonum);
            }
        }

        const locationRegionMap = new Map<string, string>();
        
        // Note: The MBO 'locations' object does not contain 'REGION', so querying it 
        // takes 30s for 400+ locations and returns nothing useful. 
        // We will default region to the State/Province or "Unknown" to avoid API timeouts.
        
        // Inject explicitly resolved Region back into woDetails
        finalRtsOrders.forEach((wo: any) => {
             const wosAddr = wo._raw && wo._raw['spi:woserviceaddress'] && wo._raw['spi:woserviceaddress'][0];
             const stateLoc = wosAddr ? wosAddr['spi:stateprovince_description'] || wosAddr['spi:stateprovince'] : undefined;
             wo.region = stateLoc || 'Unknown';
        });
        finalSchedOrders.forEach((wo: any) => {
             const wosAddr = wo._raw && wo._raw['spi:woserviceaddress'] && wo._raw['spi:woserviceaddress'][0];
             const stateLoc = wosAddr ? wosAddr['spi:stateprovince_description'] || wosAddr['spi:stateprovince'] : undefined;
             wo.region = stateLoc || 'Unknown';
        });

        return NextResponse.json({
            rtsOrders: finalRtsOrders,
            scheduledOrders: finalSchedOrders
        });

    } catch (err: any) {
        return NextResponse.json({ error: 'Database connection failed', details: err.message }, { status: 500 });
    }
}
