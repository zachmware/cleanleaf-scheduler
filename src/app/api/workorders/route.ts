import { NextResponse } from 'next/server';

export const revalidate = 300; // Cache the Maximo response for 5 minutes


export async function GET() {
    try {
        const username = process.env.MAXIMO_USER;
        const password = process.env.MAXIMO_PASS;
        
        if (!username || !password) {
            return NextResponse.json({ error: 'Maximo credentials not configured in .env.local' }, { status: 500 });
        }

        const encodedAuth = Buffer.from(`${username}:${password}`).toString('base64');
        
        const selectParams = 'wonum,description,worktype,origrecordid,jobtype_description,wopriority,statusdate,client,vendor,location,estdur,woserviceaddress{description,streetaddress,city,stateprovince,postalcode}';
        const maximoUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=status="NEWWO" and origrecordid="*"&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=100`;

        const response = await fetch(maximoUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'maxauth': encodedAuth,
                'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Maximo API returned ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const members = data['rdfs:member'] || data.member || [];
        
        const rawRecords = members.map((wo: any) => {
             const addr = (wo['spi:woserviceaddress'] && wo['spi:woserviceaddress'][0]) || {};
             
             return {
                 id: wo['spi:wonum'],
                 title: wo['spi:description'] || `Work Order ${wo['spi:wonum']}`,
                 worktype: wo['spi:worktype'] || 'CM',
                 ticketid: wo['spi:origrecordid'] || 'N/A',
                 customworktype: wo['spi:jobtype_description'] || 'O&M', 
                 ticketPriority: wo['spi:wopriority'] || 3,
                 urgency: 3, 
                 statusdate: wo['spi:statusdate'] || new Date().toISOString(),
                 customer: wo['spi:client'] || wo['spi:vendor'] || 'Unknown Client', 
                 location: wo['spi:location'] || 'UNKNOWN',
                 projectName: addr['spi:description'] || wo['spi:location'] || 'Unknown Project',
                 explicitRegion: addr['spi:stateprovince'] === 'NC' ? 'East' : 'Midwest', // Rough fallback
                 estdur: wo['spi:estdur'] || 2,
                 formattedaddress: [addr['spi:streetaddress'], addr['spi:city'], addr['spi:stateprovince']].filter(Boolean).join(', ') || 'Unknown Address', 
                 streetaddress: addr['spi:streetaddress'] || 'Unknown',
                 city: addr['spi:city'] || 'Unknown',
                 stateprovince: addr['spi:stateprovince'] || 'Unknown',
                 postalcode: addr['spi:postalcode'] || 'Unknown'
             };
        });
        
        const clusterMap = new Map<string, number>();
        rawRecords.forEach((row: any) => {
             const loc = row.location || 'UNKNOWN';
             clusterMap.set(loc, (clusterMap.get(loc) || 0) + 1);
        });

        // The Dynamic Scoring Engine
        const mappedOrders = rawRecords.map((row: any, idx: number) => {
            // Priority Mapping
            const priVal = row.ticketPriority || 3;
            let baseScore = 0;
            let expectedResponseHours = 72;
            let pText = 'Medium';
            
            if (priVal == 1 || row.urgency?.toString().toLowerCase().includes('emerg')) { baseScore = 100; expectedResponseHours = 24; pText = 'Emergency'; }
            else if (priVal == 2) { baseScore = 60; expectedResponseHours = 48; pText = 'High'; }
            else if (priVal == 3) { baseScore = 40; expectedResponseHours = 72; pText = 'Medium'; }
            else if (priVal == 4) { baseScore = 20; expectedResponseHours = 96; pText = 'Low'; }
            else { baseScore = 10; expectedResponseHours = 120; pText = 'Advisory'; }

            // SLA Linear Degradation
            let slaScore = 0;
            if (row.statusdate) {
                const statusStr = new Date(row.statusdate);
                const deadline = new Date(statusStr.getTime() + (expectedResponseHours * 60 * 60 * 1000));
                const now = new Date();
                if (now > deadline) {
                   const daysExceeded = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));
                   slaScore = daysExceeded; // +1 mathematically per day
                }
            }

            // VIP Customer Mapping (Needs DB logic, temporary mock array)
            const topTiers = ['VIP1', 'MEGA_CORP']; 
            const midTiers = ['TIER2'];
            let vipScore = 0;
            if (topTiers.includes(row.customer)) vipScore = 20;
            else if (midTiers.includes(row.customer)) vipScore = 15;

            // Clustering Cap (Math to prevent Belleville taking over)
            const localCasesCount = clusterMap.get(row.location || 'UNKNOWN') || 1;
            const clusterPointsRaw = localCasesCount * 2; // +2 points per neighboring case 
            const clusterScore = Math.min(clusterPointsRaw, 15); // Hard cap diminish at 15 points

            // Ultimate Total Engine Output 
            const finalDynamicScoreRaw = baseScore + slaScore + vipScore + clusterScore;
            // Cap at 100 explicitly
            const finalDynamicScore = Math.min(finalDynamicScoreRaw, 100);

            // Dynamic Address Compilation Arrays 
            const stringAddrNode = [row.streetaddress, row.city, row.stateprovince].filter(Boolean).join(', ');
            const formattedFallback = stringAddrNode ? `${stringAddrNode} ${row.postalcode || ''}`.trim() : null;
            const trueServiceAddress = row.formattedaddress || formattedFallback;

            // Physical Duration Conditional Overrides
            let strictDuration = row.estdur || 2;
            const targetWType = (row.customworktype || '').toLowerCase();
            if (targetWType.includes('reactive')) strictDuration = 1.5;
            if (targetWType.includes('maintenance')) strictDuration = 6.0;

            return {
                id: `${row.id}_${idx}`, // Synthesize strictly unique key accommodating multiple AR requirements for the exact same WorkOrder wonum
                title: row.title || 'Work Order',
                workType: row.worktype || 'General',
                priority: finalDynamicScore, // Repurposing schema to store total value
                durationHours: strictDuration, // Overridden natively by customworktype strings
                region: row.explicitRegion || 'Midwest', // Needs geo mapping
                status: 'RTS',
                _isAbsoluteEmergency: baseScore === 100,
                // Phase 8 additions:
                caseNumber: row.ticketid || 'Unknown',
                caseType: row.customworktype || 'Unknown',
                projectName: row.projectName || 'Unknown',
                projectAddress: trueServiceAddress, // Native geomatrix mappings natively
                reportedPriorityText: pText
            };
        });

        // Critical Triaging Priority Overrides (Absolute Emergency rules)
        mappedOrders.sort((a: any, b: any) => {
             // 1. Force Absolute Emergency 100s to the tippy-top regardless of other items compounding to 101+
             if (a._isAbsoluteEmergency && !b._isAbsoluteEmergency) return -1;
             if (b._isAbsoluteEmergency && !a._isAbsoluteEmergency) return 1;
             
             // 2. Sort standard items natively by the Dynamic Math Logic
             return b.priority - a.priority;
        });

        // Strip the sorting flag before shipping to React constraints
        const optimizedCleanedResults = mappedOrders.map(({ _isAbsoluteEmergency, ...rest }: any) => rest);

        return NextResponse.json(optimizedCleanedResults);
    } catch (err: any) {
        return NextResponse.json({ error: 'Database connection failed', details: err.message }, { status: 500 });
    }
}
