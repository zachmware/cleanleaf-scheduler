import { NextResponse } from 'next/server';
import sql from 'mssql';

let rawServer = process.env.DB_SERVER || 'localhost';
let parsedPort = 1433;
if (rawServer.includes(':')) {
    const parts = rawServer.split(':');
    rawServer = parts[0];
    parsedPort = parseInt(parts[1], 10);
}

const sqlConfig = {
    user: process.env.DB_USER as string,
    password: process.env.DB_PASSWORD as string,
    database: process.env.DB_DATABASE as string,
    server: rawServer,
    port: parsedPort,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    options: {
        encrypt: false, 
        trustServerCertificate: true 
    }
};

export async function GET() {
    try {
        await sql.connect(sqlConfig);
        
        // Exact user query 
        const maximoQuery = `
            SELECT 
                wo.wonum as id,
                wo.description as title,
                wo.worktype,
                t.ticketid,
                t.customworktype,
                t.reportedpriority as ticketPriority,
                t.urgency,
                wo.statusdate,
                t.vendor as customer,
                wo.location,
                loc.description as projectName,
                loc.region as explicitRegion,
                wo.estdur,
                sa.formattedaddress,
                sa.streetaddress,
                sa.city,
                sa.stateprovince,
                sa.postalcode
            FROM woadditionalresource ar
            JOIN workorder wo ON wo.wonum=ar.wonum AND ar.status='None' AND wo.status='NEWWO'
            JOIN ticket t ON t.ticketid=wo.origrecordid
            LEFT JOIN locations loc ON loc.location = wo.location
            LEFT JOIN serviceaddress sa ON sa.addresscode = loc.location
            WHERE t.status IN ('STAGE6', 'STAGE6B')
        `;

        const result = await sql.query(maximoQuery);
        
        const clusterMap = new Map<string, number>();
        result.recordset.forEach((row: any) => {
             const loc = row.location || 'UNKNOWN';
             clusterMap.set(loc, (clusterMap.get(loc) || 0) + 1);
        });

        // The Dynamic Scoring Engine
        const mappedOrders = result.recordset.map((row: any, idx: number) => {
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
