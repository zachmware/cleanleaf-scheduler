import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(request: Request) {
    try {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
        }

        const resend = new Resend(apiKey);
        const { scheduledOrders: allOrders, technicians, targetDate } = await request.json();

        // Filter to only appointments on the target date (timezone-safe: compare date strings directly)
        let scheduledOrders = targetDate 
            ? allOrders.filter((o: any) => {
                const timeStr = o.startTime || o.checkInTime;
                if (!timeStr) return false;
                // Extract date portion directly from ISO string (avoid UTC conversion issues)
                const orderDate = String(timeStr).split('T')[0];
                return orderDate === targetDate;
              })
            : allOrders;
        
        // Fallback: if date filter eliminated everything, use all orders with a time and tech
        if (scheduledOrders.length === 0 && allOrders.length > 0) {
            console.warn(`Date filter for ${targetDate} matched 0 of ${allOrders.length} orders. Using all assigned orders as fallback.`);
            scheduledOrders = allOrders.filter((o: any) => (o.startTime || o.checkInTime) && o.assignedTechId);
        }

        if (!scheduledOrders || scheduledOrders.length === 0) {
            return NextResponse.json({ error: `No scheduled appointments found for ${targetDate || 'the target date'}` }, { status: 400 });
        }

        // Group orders by tech for travel time logic
        const ordersByTech = new Map<string, any[]>();
        for (const order of scheduledOrders) {
            const techId = order.assignedTechId || 'UNASSIGNED';
            if (!ordersByTech.has(techId)) ordersByTech.set(techId, []);
            ordersByTech.get(techId)!.push(order);
        }
        // Sort each tech's orders by start time
        for (const [, orders] of ordersByTech) {
            orders.sort((a: any, b: any) => new Date(a.startTime || a.checkInTime).getTime() - new Date(b.startTime || b.checkInTime).getTime());
        }

        // Build CSV content (compatible with Excel)
        const headers = [
            'Work Order', 'Case #', 'Title', 'Case Type', 'Priority', 'Priority Score',
            'Region', 'Project', 'Address', 'Technician', 'Tech ID', 'Start Time',
            'Duration (hrs)', 'Travel To (min)', 'Travel From (min)', 'Status'
        ];

        let totalTravelTo = 0;
        let totalTravelFrom = 0;
        let totalPriorityScore = 0;

        const rows: string[] = [];
        for (const [techId, techOrders] of ordersByTech) {
            const tech = technicians?.find((t: any) => t.id === techId);
            const techName = tech?.name || techId || 'Unassigned';

            techOrders.forEach((order: any, idx: number) => {
                const isFirst = idx === 0;
                const isLast = idx === techOrders.length - 1;
                const travelTo = order.travelToMins != null ? order.travelToMins : '';
                
                // Travel From: only show on the LAST appointment for each tech
                // For the last appointment, estimate travel home (same as travelTo as approximation)
                const travelFrom = isLast ? (order.travelToMins != null ? order.travelToMins : '') : '';

                // For multi-appointment techs, only show travel-to on transitions 
                // (first appointment gets travel from home, subsequent get travel between sites)
                const displayTravelTo = isFirst ? travelTo : (order.travelToMins != null ? order.travelToMins : '');

                if (typeof displayTravelTo === 'number') totalTravelTo += displayTravelTo;
                if (typeof travelFrom === 'number') totalTravelFrom += travelFrom;
                totalPriorityScore += order.priority || 0;

                rows.push([
                    order.id?.split('_')[0] || '',
                    order.caseNumber || '',
                    `"${(order.title || '').replace(/"/g, '""')}"`,
                    order.caseType || '',
                    order.reportedPriorityText || '',
                    order.priority || '',
                    order.region || '',
                    `"${(order.projectName || '').replace(/"/g, '""')}"`,
                    `"${(order.projectAddress || '').replace(/"/g, '""')}"`,
                    `"${techName}"`,
                    order.assignedTechId || '',
                    (order.startTime || order.checkInTime) ? new Date(order.startTime || order.checkInTime).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '',
                    order.durationHours || '',
                    displayTravelTo,
                    travelFrom,
                    order.status || ''
                ].join(','));
            });
        }

        // Build summary stats
        const uniqueTechs = new Set(scheduledOrders.map((o: any) => o.assignedTechId).filter(Boolean));
        const uniqueRegions = new Set(scheduledOrders.map((o: any) => o.region).filter(Boolean));
        const totalHours = scheduledOrders.reduce((sum: number, o: any) => sum + (o.durationHours || 0), 0);
        const avgPriority = scheduledOrders.length > 0 ? (totalPriorityScore / scheduledOrders.length).toFixed(1) : '0';
        const avgAptsPerTech = uniqueTechs.size > 0 ? (scheduledOrders.length / uniqueTechs.size).toFixed(1) : '0';
        const totalTravelMins = totalTravelTo + totalTravelFrom;
        const avgTravelPerTech = uniqueTechs.size > 0 ? (totalTravelMins / uniqueTechs.size).toFixed(0) : '0';
        const avgWorkPerTech = uniqueTechs.size > 0 ? (totalHours / uniqueTechs.size).toFixed(1) : '0';

        // Summary row
        const summaryRow = [
            '"SUMMARY"', '', '', '', '', avgPriority,
            '', '', '', `"${uniqueTechs.size} techs"`, '',
            `"Avg ${avgAptsPerTech}/tech"`,
            totalHours.toFixed(1),
            totalTravelTo,
            totalTravelFrom,
            `"${scheduledOrders.length} appointments"`,
        ].join(',');

        const csvContent = [headers.join(','), ...rows, '', summaryRow].join('\n');
        const csvBuffer = Buffer.from(csvContent, 'utf-8');

        const emailHtml = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px;">
                <div style="background: #0f172a; border-radius: 12px; padding: 24px; color: #e2e8f0; border: 1px solid #1e293b;">
                    <h1 style="color: #10b981; margin: 0 0 8px; font-size: 22px;">📋 Auto-Schedule Report</h1>
                    <p style="color: #94a3b8; margin: 0 0 24px; font-size: 14px;">Target Date: ${targetDate || 'Not specified'}</p>
                    
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px;">
                        <div style="background: #1a2332; border-radius: 8px; padding: 14px; text-align: center; border: 1px solid #2a3a4a;">
                            <div style="font-size: 26px; font-weight: 700; color: #10b981;">${scheduledOrders.length}</div>
                            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Appointments</div>
                        </div>
                        <div style="background: #1a2332; border-radius: 8px; padding: 14px; text-align: center; border: 1px solid #2a3a4a;">
                            <div style="font-size: 26px; font-weight: 700; color: #10b981;">${uniqueTechs.size}</div>
                            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Technicians</div>
                        </div>
                        <div style="background: #1a2332; border-radius: 8px; padding: 14px; text-align: center; border: 1px solid #2a3a4a;">
                            <div style="font-size: 26px; font-weight: 700; color: #10b981;">${avgAptsPerTech}</div>
                            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Avg Apts/Tech</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px;">
                        <div style="background: #1a2332; border-radius: 8px; padding: 12px; text-align: center; border: 1px solid #2a3a4a;">
                            <div style="font-size: 20px; font-weight: 700; color: #3b82f6;">${totalHours.toFixed(1)}h</div>
                            <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Work Time</div>
                        </div>
                        <div style="background: #1a2332; border-radius: 8px; padding: 12px; text-align: center; border: 1px solid #2a3a4a;">
                            <div style="font-size: 20px; font-weight: 700; color: #f59e0b;">${(totalTravelMins / 60).toFixed(1)}h</div>
                            <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Travel Time</div>
                        </div>
                        <div style="background: #1a2332; border-radius: 8px; padding: 12px; text-align: center; border: 1px solid #2a3a4a;">
                            <div style="font-size: 20px; font-weight: 700; color: #8b5cf6;">${avgWorkPerTech}h</div>
                            <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Avg Work/Tech</div>
                        </div>
                        <div style="background: #1a2332; border-radius: 8px; padding: 12px; text-align: center; border: 1px solid #2a3a4a;">
                            <div style="font-size: 20px; font-weight: 700; color: #ec4899;">${avgPriority}</div>
                            <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Avg Priority</div>
                        </div>
                    </div>
                    
                    <p style="color: #94a3b8; font-size: 13px; margin: 0;">
                        Regions: ${[...uniqueRegions].join(', ')}<br/>
                        Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
                    </p>
                    
                    <div style="margin-top: 16px; padding: 12px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px;">
                        <p style="color: #f59e0b; font-size: 12px; margin: 0;">
                            ⚠️ This is a comparison report only. No changes were written to Maximo.
                        </p>
                    </div>
                </div>
            </div>
        `;

        const { data, error } = await resend.emails.send({
            from: 'CleanLeaf Scheduler <onboarding@resend.dev>',
            to: ['zware@borregosolar.com'],
            subject: `📋 Auto-Schedule Report — ${targetDate || new Date().toISOString().split('T')[0]}`,
            html: emailHtml,
            attachments: [
                {
                    filename: `schedule-report-${targetDate || 'export'}.csv`,
                    content: csvBuffer.toString('base64'),
                    contentType: 'text/csv',
                }
            ]
        });

        if (error) {
            console.error('Resend error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            emailId: data?.id,
            message: `Schedule report for ${targetDate} sent to zware@borregosolar.com (${scheduledOrders.length} appointments)`
        });

    } catch (e: any) {
        console.error('Email send error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
