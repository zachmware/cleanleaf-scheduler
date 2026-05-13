import { NextResponse } from 'next/server';

export const revalidate = 300; // Cache the Maximo response for 5 minutes

function processRawRecords(members: any[], clusterMap: Map<string, number>, isScheduled: boolean, assignments?: any[]) {
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
            explicitRegion: addr['spi:stateprovince'] === 'NC' ? 'East' : 'Midwest', 
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
            const assignment = assignments.find((a: any) => a['spi:wonum'] === row.id);
            if (assignment) {
                finalStatus = 'SCHEDULED';
                assignedTechId = assignment['spi:laborcode'];
                startTime = assignment['spi:scheduledate'];
                if (assignment['spi:laborhrs'] && typeof assignment['spi:laborhrs'] === 'number') {
                    strictDuration = assignment['spi:laborhrs'];
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
        
        const selectParams = 'wonum,description,worktype,origrecordid,jobtype_description,wopriority,statusdate,client,vendor,location,estdur,woserviceaddress{description,streetaddress,city,stateprovince,postalcode}';
        
        // 1. Fetch RTS Work Orders
        const maximoUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=status="NEWWO" and origrecordid="*"&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=100`;
        const response = await fetch(maximoUrl, { method: 'GET', headers });
        if (!response.ok) {
            throw new Error(`Maximo API returned ${response.status}: ${await response.text()}`);
        }
        const data = await response.json();
        const rtsMembers = data['rdfs:member'] || data.member || [];

        // 2. Fetch Active Assignments
        const assignUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiassignment?oslc.where=status!="NONE"&oslc.select=wonum,laborcode,status,scheduledate,laborhrs&oslc.pageSize=100&oslc.orderBy=-scheduledate`;
        const resAssign = await fetch(assignUrl, { method: 'GET', headers });
        let assignments: any[] = [];
        let scheduledMembers: any[] = [];

        if (resAssign.ok) {
            const dataAssign = await resAssign.json();
            assignments = dataAssign['rdfs:member'] || dataAssign.member || [];
            
            const wonums = Array.from(new Set(assignments.map((a: any) => a['spi:wonum']).filter(Boolean)));
            
            if (wonums.length > 0) {
                // Chunk to avoid long URLs
                for (let i = 0; i < wonums.length; i += 25) {
                    const chunk = wonums.slice(i, i + 25);
                    const wonumStr = chunk.map((w: any) => `"${w}"`).join(',');
                    const schedUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=wonum in [${wonumStr}]&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=50`;
                    const resSched = await fetch(schedUrl, { method: 'GET', headers });
                    if (resSched.ok) {
                        const dataSched = await resSched.json();
                        scheduledMembers = scheduledMembers.concat(dataSched['rdfs:member'] || dataSched.member || []);
                    }
                }
            }
        }

        const clusterMap = new Map<string, number>();
        [...rtsMembers, ...scheduledMembers].forEach((wo: any) => {
             const loc = wo['spi:location'] || 'UNKNOWN';
             clusterMap.set(loc, (clusterMap.get(loc) || 0) + 1);
        });

        const rtsOrders = processRawRecords(rtsMembers, clusterMap, false);
        const scheduledOrders = processRawRecords(scheduledMembers, clusterMap, true, assignments);

        return NextResponse.json({
            rtsOrders,
            scheduledOrders
        });

    } catch (err: any) {
        return NextResponse.json({ error: 'Database connection failed', details: err.message }, { status: 500 });
    }
}
