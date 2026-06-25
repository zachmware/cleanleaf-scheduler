import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(request: Request) {
    try {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
        }

        const resend = new Resend(apiKey);
        const { scheduledOrders, technicians, targetDate } = await request.json();

        if (!scheduledOrders || scheduledOrders.length === 0) {
            return NextResponse.json({ error: 'No scheduled orders to send' }, { status: 400 });
        }

        // Build CSV content (compatible with Excel)
        const headers = [
            'Work Order', 'Case #', 'Title', 'Case Type', 'Priority', 'Region',
            'Project', 'Address', 'Technician', 'Tech ID', 'Start Time',
            'Duration (hrs)', 'Status'
        ];

        const rows = scheduledOrders.map((order: any) => {
            const tech = technicians?.find((t: any) => t.id === order.assignedTechId);
            const techName = tech?.name || order.assignedTechId || 'Unassigned';
            
            return [
                order.id?.split('_')[0] || '',
                order.caseNumber || '',
                `"${(order.title || '').replace(/"/g, '""')}"`,
                order.caseType || '',
                order.reportedPriorityText || '',
                order.region || '',
                `"${(order.projectName || '').replace(/"/g, '""')}"`,
                `"${(order.projectAddress || '').replace(/"/g, '""')}"`,
                `"${techName}"`,
                order.assignedTechId || '',
                order.startTime ? new Date(order.startTime).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '',
                order.durationHours || '',
                order.status || ''
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const csvBuffer = Buffer.from(csvContent, 'utf-8');

        // Build summary stats
        const uniqueTechs = new Set(scheduledOrders.map((o: any) => o.assignedTechId).filter(Boolean));
        const uniqueRegions = new Set(scheduledOrders.map((o: any) => o.region).filter(Boolean));
        const totalHours = scheduledOrders.reduce((sum: number, o: any) => sum + (o.durationHours || 0), 0);

        const emailHtml = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                <div style="background: #0f172a; border-radius: 12px; padding: 24px; color: #e2e8f0; border: 1px solid #1e293b;">
                    <h1 style="color: #10b981; margin: 0 0 8px; font-size: 22px;">📋 Auto-Schedule Report</h1>
                    <p style="color: #94a3b8; margin: 0 0 24px; font-size: 14px;">Target Date: ${targetDate || 'Not specified'}</p>
                    
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
                        <div style="background: #1a2332; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid #2a3a4a;">
                            <div style="font-size: 28px; font-weight: 700; color: #10b981;">${scheduledOrders.length}</div>
                            <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Cases Scheduled</div>
                        </div>
                        <div style="background: #1a2332; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid #2a3a4a;">
                            <div style="font-size: 28px; font-weight: 700; color: #10b981;">${uniqueTechs.size}</div>
                            <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Technicians</div>
                        </div>
                        <div style="background: #1a2332; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid #2a3a4a;">
                            <div style="font-size: 28px; font-weight: 700; color: #10b981;">${totalHours.toFixed(1)}</div>
                            <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Total Hours</div>
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
            to: ['zware@cleanleafenergy.com'],
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
            message: `Schedule report sent to zware@cleanleafenergy.com`
        });

    } catch (e: any) {
        console.error('Email send error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
