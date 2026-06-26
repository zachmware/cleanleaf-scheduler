import { NextResponse } from 'next/server';

export const revalidate = 0; // Disable cache so Maximo updates are instant

function mapStateToRegion(stateVal: string, cityVal: string): string {
    const s = stateVal.toUpperCase();
    const c = cityVal.toUpperCase();
    
    // Mid Atlantic: NC, VA, MD, PA, SC, DC
    if (['NC', 'VA', 'MD', 'PA', 'SC', 'DC', 'NORTH CAROLINA', 'VIRGINIA', 'MARYLAND', 'PENNSYLVANIA', 'SOUTH CAROLINA'].includes(s)) return 'Mid Atlantic';
    // New England: MA, CT, RI, NH, VT, ME, NY, NJ
    if (['MA', 'CT', 'RI', 'NH', 'VT', 'ME', 'NY', 'NJ', 'MASSACHUSETTS', 'CONNECTICUT', 'RHODE ISLAND', 'NEW HAMPSHIRE', 'VERMONT', 'MAINE', 'NEW YORK', 'NEW JERSEY'].includes(s)) return 'New England';
    // California split
    if (s === 'CA' || s === 'CALIFORNIA') {
        const norCalCities = [
            // Bay Area
            'SAN FRANCISCO', 'SOUTH SAN FRANCISCO', 'OAKLAND', 'SAN JOSE', 'FREMONT', 'HAYWARD', 'SUNNYVALE', 'SANTA CLARA', 'BERKELEY', 'RICHMOND', 'CONCORD', 'ANTIOCH', 'VALLEJO', 'DALY CITY', 'SAN MATEO', 'REDWOOD CITY', 'PALO ALTO', 'MOUNTAIN VIEW', 'MILPITAS', 'PLEASANTON', 'LIVERMORE', 'DUBLIN', 'SAN RAMON', 'WALNUT CREEK', 'DANVILLE', 'MARTINEZ', 'PITTSBURG', 'BRENTWOOD', 'CUPERTINO', 'CAMPBELL', 'LOS GATOS', 'SARATOGA', 'MENLO PARK', 'FOSTER CITY', 'SAN LEANDRO', 'UNION CITY', 'NEWARK', 'ALAMEDA',
            // Sacramento / Central Valley
            'SACRAMENTO', 'ROSEVILLE', 'ELK GROVE', 'FOLSOM', 'RANCHO CORDOVA', 'CITRUS HEIGHTS', 'ROCKLIN', 'LINCOLN', 'WOODLAND', 'DAVIS', 'WEST SACRAMENTO', 'STOCKTON', 'MODESTO', 'TRACY', 'MANTECA', 'LODI', 'TURLOCK', 'CERES', 'PATTERSON', 'MERCED', 'MADERA', 'FRESNO', 'VISALIA', 'TULARE', 'HANFORD', 'LEMOORE', 'PORTERVILLE', 'LOS BANOS', 'CHOWCHILLA', 'ATWATER', 'LIVINGSTON',
            // North Valley / Gold Country
            'REDDING', 'CHICO', 'YUBA CITY', 'MARYSVILLE', 'OROVILLE', 'RED BLUFF', 'ANDERSON', 'PARADISE', 'GRASS VALLEY', 'AUBURN', 'PLACERVILLE',
            // North Coast / Wine Country
            'SANTA ROSA', 'NAPA', 'PETALUMA', 'ROHNERT PARK', 'SONOMA', 'HEALDSBURG', 'UKIAH', 'EUREKA', 'ARCATA', 'FORTUNA', 'CRESCENT CITY', 'BENICIA',
            // Monterey / Central Coast (above SLO is Nor Cal)
            'GILROY', 'MORGAN HILL', 'HOLLISTER', 'WATSONVILLE', 'SALINAS', 'MONTEREY', 'SANTA CRUZ', 'HALF MOON BAY', 'PACIFIC GROVE', 'SEASIDE', 'MARINA', 'CARMEL',
            // East Bay / Contra Costa
            'CLAYTON', 'ORINDA', 'LAFAYETTE', 'MORAGA', 'SAN PABLO', 'EL CERRITO', 'HERCULES', 'PINOLE', 'BYRON', 'DISCOVERY BAY', 'OAKLEY',
            // San Joaquin / Central
            'NEWMAN', 'GUSTINE', 'RIPON', 'ESCALON', 'RIVERBANK', 'OAKDALE', 'SONORA',
            // Solano
            'FAIRFIELD', 'VACAVILLE', 'SUISUN CITY', 'DIXON', 'RIO VISTA'
        ];
        return norCalCities.some(nc => c.includes(nc)) ? 'Nor Cal' : 'So Cal';
    }
    // Southeast: GA, FL, AL, TN, LA, MS
    if (['GA', 'FL', 'AL', 'TN', 'LA', 'MS', 'GEORGIA', 'FLORIDA', 'ALABAMA', 'TENNESSEE', 'LOUISIANA', 'MISSISSIPPI'].includes(s)) return 'Southeast';
    
    return 'Midwest';
}

function processRawRecords(members: any[], clusterMap: Map<string, number>, isScheduled: boolean, assignments?: any[]) {
    const rawRecords = members.map((wo: any) => {
        const addr = (wo['spi:woserviceaddress'] && wo['spi:woserviceaddress'][0]) || {};
        const locNode = (wo['spi:locations'] && wo['spi:locations'][0]) || {};
        const explicitMboRegion = wo._explicitMboRegion;
        
        const rawDesc = wo['spi:description'] || `Work Order ${wo['spi:wonum']}`;
        const cleanDesc = rawDesc.replace(/\[.*?\]/g, '').trim();
        const stateVal = addr['spi:stateprovince'] || addr['spi:stateprovince_description'] || '';
        const cityVal = addr['spi:city'] || '';
        const mappedRegion = mapStateToRegion(stateVal, cityVal);
        const descLower = rawDesc.toLowerCase();

        return {
            id: wo['spi:wonum'],
            title: cleanDesc,
            worktype: wo['spi:worktype'] || 'CM',
            ticketid: wo['spi:origrecordid'] || 'N/A',
            customworktype: descLower.includes('maintenance') ? 'Maintenance' : 'Reactive', 
            ticketPriority: wo['spi:wopriority'] || 3,
            urgency: 3, 
            statusdate: wo['spi:statusdate'] || new Date().toISOString(),
            customer: wo['spi:client'] || wo['spi:vendor'] || 'Unknown Client', 
            location: wo['spi:location'] || 'UNKNOWN',
            projectName: addr['spi:description'] || wo['spi:location'] || 'Unknown Project',
            explicitRegion: explicitMboRegion || locNode['spi:region'] || mappedRegion, 
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
            location: row.location || 'UNKNOWN',
            status: finalStatus,
            _isAbsoluteEmergency: baseScore === 100,
            caseNumber: row.ticketid || 'Unknown',
            caseType: row.customworktype || 'Unknown',
            customer: row.customer || 'Unknown Client',
            projectName: row.projectName || 'Unknown',
            projectAddress: trueServiceAddress, 
            reportedPriorityText: pText,
            bundleOnly: false,
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

// Safe fetch wrapper — never throws, returns null on failure
async function safeFetch(url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<Response | null> {
    try {
        return await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
        return null;
    }
}

// Safe JSON parse from a fetch response
async function safeJson(res: Response | null): Promise<any> {
    if (!res || !res.ok) return null;
    try {
        return await res.json();
    } catch {
        return null;
    }
}

export async function GET() {
    try {
        const username = process.env.MAXIMO_USER;
        const password = process.env.MAXIMO_PASS;
        if (!username || !password) {
            return NextResponse.json({ error: 'Maximo credentials not configured in .env.local' }, { status: 500 });
        }

        const encodedAuth = Buffer.from(`${username}:${password}`).toString('base64');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'maxauth': encodedAuth,
            'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc'
        };

        // ──────────────────────────────────────────────────────
        // PHASE 1: Three initial fetches in parallel (< 2s)
        // ──────────────────────────────────────────────────────
        const [resSide, resSched, resSr] = await Promise.all([
            safeFetch(`https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=10000&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc`, headers, 15000),
            safeFetch(`https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=800&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=SCHEDSTART%20desc`, headers),
            safeFetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=status="STAGE6"&oslc.select=ticketid,status&oslc.pageSize=2000`, headers)
        ]);

        const dataSide = await safeJson(resSide);
        const dataSched = await safeJson(resSched);
        const dataSr = await safeJson(resSr);

        const allSide: any[] = dataSide?.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
        const allSched: any[] = dataSched?.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
        const allSrs: any[] = dataSr?.['rdfs:member'] || dataSr?.member || [];

        // Build set of STAGE6 SR ticket IDs for filtering
        const stage6TicketIds = new Set(allSrs.map((sr: any) => String(sr['spi:ticketid'])).filter(Boolean));

        // Also fetch STAGE6B SRs (ready to bundle)
        const resS6b = await safeFetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=status="STAGE6B"&oslc.select=ticketid,status&oslc.pageSize=2000`, headers);
        const dataS6b = await safeJson(resS6b);
        const allS6b: any[] = dataS6b?.['rdfs:member'] || dataS6b?.member || [];
        const stage6bTicketIds = new Set(allS6b.map((sr: any) => String(sr['spi:ticketid'])).filter(Boolean));

        // Extract resource lists
        const rtsResources = allSide.filter((a: any) => a.Attributes?.STATUS?.content === 'None');
        const scheduledResources = allSched.filter((a: any) => a.Attributes?.STATUS?.content !== 'None' && a.Attributes?.SCHEDSTART);

        // Collect ALL wonums we need details for (RTS + Scheduled) 
        const rtsWonums = [...new Set(rtsResources.map((a: any) => a.Attributes?.WONUM?.content).filter(Boolean))];
        const schedWonums = [...new Set(scheduledResources.map((a: any) => a.Attributes?.WONUM?.content).filter(Boolean))];

        // ──────────────────────────────────────────────────────
        // PHASE 2: Fetch WO details — ALL in one parallel blast
        // Build two sets of chunk tasks and fire them all at once
        // ──────────────────────────────────────────────────────
        const selectParams = 'wonum,status,description,worktype,origrecordid,jobtype_description,wopriority,statusdate,client,vendor,location,estdur,woserviceaddress{description,streetaddress,city,stateprovince,postalcode},locations{region}';
        
        // Build all chunk URL tasks as functions (not started yet)
        const allChunkFns: (() => Promise<any[]>)[] = [];

        // Chunk tasks for RTS WOs (fetched directly by wonum)
        for (let i = 0; i < rtsWonums.length; i += 200) {
            const chunk = rtsWonums.slice(i, i + 200);
            const wonumStr = chunk.map(w => `"${w}"`).join(',');
            const whereClause = encodeURIComponent(`wonum in [${wonumStr}]`);
            const osUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=${whereClause}&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=500`;
            allChunkFns.push(() =>
                safeFetch(osUrl, headers).then(r => safeJson(r)).then(data => data ? (data['rdfs:member'] || data.member || []) : [])
            );
        }

        // Chunk tasks for Scheduled WOs (by wonum directly)
        for (let i = 0; i < schedWonums.length; i += 200) {
            const chunk = schedWonums.slice(i, i + 200);
            const wonumStr = chunk.map(w => `"${w}"`).join(',');
            const whereClause = encodeURIComponent(`wonum in [${wonumStr}]`);
            const osUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=${whereClause}&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=500`;
            allChunkFns.push(() =>
                safeFetch(osUrl, headers).then(r => safeJson(r)).then(data => data ? (data['rdfs:member'] || data.member || []) : [])
            );
        }

        // Execute in controlled batches of 10 concurrent requests max
        const allChunkResults: any[][] = [];
        for (let i = 0; i < allChunkFns.length; i += 10) {
            const batch = allChunkFns.slice(i, i + 10).map(fn => fn());
            const batchResults = await Promise.all(batch);
            allChunkResults.push(...batchResults);
        }
        
        // Merge all results into a single WO map
        const finalValidWosMap = new Map<string, any>();
        for (const chunk of allChunkResults) {
            for (const wo of chunk) {
                if (wo['spi:wonum']) finalValidWosMap.set(wo['spi:wonum'], wo);
            }
        }

        // ──────────────────────────────────────────────────────
        // PHASE 3: Process into RTS + Scheduled output
        // ──────────────────────────────────────────────────────
        let finalRtsOrders: any[] = [];
        let finalSchedOrders: any[] = [];

        // Cluster Map for scoring
        const clusterMap = new Map<string, number>();
        for (const wo of finalValidWosMap.values()) {
            const loc = wo['spi:location'] || 'UNKNOWN';
            clusterMap.set(loc, (clusterMap.get(loc) || 0) + 1);
        }

        // Build RTS — one entry per WO, only NEWWO status, only STAGE6/STAGE6B cases
        // Uses origrecordid to match WO back to its originating SR ticket
        const seenRtsWonums = new Set<string>();
        const stage6Locations = new Set<string>();
        const stage6bCandidates: any[] = [];
        
        for (const res of rtsResources) {
            const wonum = res.Attributes?.WONUM?.content;
            if (wonum && finalValidWosMap.has(wonum) && !seenRtsWonums.has(wonum)) {
                const wo = finalValidWosMap.get(wonum);
                if (wo['spi:status'] === 'NEWWO') {
                    const caseNum = wo['spi:origrecordid'] || null;
                    
                    // Skip WOs without an origrecordid — can't verify stage
                    if (!caseNum) {
                        seenRtsWonums.add(wonum);
                        continue;
                    }
                    
                    // Check if this is a STAGE6B case — save for bundle pairing
                    if (stage6bTicketIds.has(caseNum)) {
                        stage6bCandidates.push(wo);
                        seenRtsWonums.add(wonum);
                        continue;
                    }
                    
                    // Only include STAGE6 cases
                    if (!stage6TicketIds.has(caseNum)) {
                        seenRtsWonums.add(wonum);
                        continue;
                    }
                    
                    const processed = processRawRecords([wo], clusterMap, false, rtsResources);
                    if (processed.length > 0) {
                        finalRtsOrders.push(processed[0]);
                        stage6Locations.add(wo['spi:location'] || 'UNKNOWN');
                    }
                }
                seenRtsWonums.add(wonum);
            }
        }
        
        // Now add STAGE6B cases that share a location with a STAGE6 case
        for (const wo of stage6bCandidates) {
            const loc = wo['spi:location'] || 'UNKNOWN';
            if (stage6Locations.has(loc)) {
                const processed = processRawRecords([wo], clusterMap, false, rtsResources);
                if (processed.length > 0) {
                    processed[0].bundleOnly = true;
                    processed[0].caseType = (processed[0].caseType || '') + ' (Bundle)';
                    finalRtsOrders.push(processed[0]);
                }
            }
        }

        // Build Scheduled — one entry per (wonum + techId) pair
        const seenSchedKeys = new Set<string>();
        for (const res of scheduledResources) {
            const wonum = res.Attributes?.WONUM?.content;
            const techId = res.Attributes?.PERSONID?.content || 'UNKNOWN';
            const dedupKey = `${wonum}_${techId}`;
            if (wonum && finalValidWosMap.has(wonum) && !seenSchedKeys.has(dedupKey)) {
                const wo = finalValidWosMap.get(wonum);
                const processed = processRawRecords([wo], clusterMap, true, [res]);
                if (processed.length > 0) {
                    processed[0].id = `${wonum}_${techId}`;
                    finalSchedOrders.push(processed[0]);
                }
                seenSchedKeys.add(dedupKey);
            }
        }

        return NextResponse.json({
            rtsOrders: finalRtsOrders,
            scheduledOrders: finalSchedOrders,
            _debug: {
                woadditionalresource_total: allSide.length,
                rts_resources: rtsResources.length,
                unique_rts_wonums: rtsWonums.length,
                stage6_srs: stage6TicketIds.size,
                stage6b_srs: stage6bTicketIds.size,
                wo_details_fetched: finalValidWosMap.size,
                rts_output: finalRtsOrders.length,
                stage6b_bundled: stage6bCandidates.length,
                scheduled_output: finalSchedOrders.length,
            }
        }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
            }
        });

    } catch (err: any) {
        console.error('Workorder API Error:', err);
        // Always return 200 with empty data so frontend never sees a hard error
        return NextResponse.json({ rtsOrders: [], scheduledOrders: [], _error: err.message }, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0' }
        });
    }
}
