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
        
        const maximoQuery = `
            SELECT 
                p.personid AS id, 
                p.displayname AS name, 
                p.timezone, 
                pgt.persongroup AS region,
                p.addressline1,
                p.city,
                p.stateprovince,
                p.postalcode
            FROM person p
            JOIN labor l ON l.personid = p.personid
            JOIN laborcraftrate lcr ON lcr.laborcode = l.laborcode
            JOIN persongroupteam pgt ON pgt.respparty = p.personid 
                 AND pgt.persongroup IN (SELECT DISTINCT region FROM locations WHERE region IS NOT NULL)
            WHERE lcr.craft = 'SOLAR_ELECTRICIAN_1'
            ORDER BY p.displayname ASC
        `;

        const result = await sql.query(maximoQuery);
        
        const deduplicatedMap = new Map<string, any>();
        
        result.recordset.forEach((row: any) => {
            if (!deduplicatedMap.has(row.id)) {
                // Dynamically compile physical string, purging null segments natively
                const addressNode = [row.addressline1, row.city, row.stateprovince].filter(Boolean).join(', ');
                const finalAddressString = addressNode ? `${addressNode} ${row.postalcode || ''}`.trim() : null;

                deduplicatedMap.set(row.id, {
                    id: row.id,
                    name: row.name || 'Unknown Tech',
                    timezone: row.timezone || 'America/New_York', // Natively map timezone
                    region: row.region || 'DEFAULT', // Used for region bucket allocation logic
                    homeAddress: finalAddressString || row.region || 'Unknown', 
                    skills: ['SOLAR_ELECTRICIAN_1']
                });
            }
        });

        const finalRoster = Array.from(deduplicatedMap.values());
        return NextResponse.json(finalRoster);
    } catch (err: any) {
        return NextResponse.json({ error: 'Database connection failed', details: err.message }, { status: 500 });
    }
}
