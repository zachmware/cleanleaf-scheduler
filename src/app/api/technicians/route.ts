import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const username = process.env.MAXIMO_USER;
        const password = process.env.MAXIMO_PASS;
        
        if (!username || !password) {
            return NextResponse.json({ error: 'Maximo credentials not configured in .env.local' }, { status: 500 });
        }

        const encodedAuth = Buffer.from(`${username}:${password}`).toString('base64');
        
        // We will query MXLABOR and expand the PERSON object to get address details.
        // If your Maximo system has a custom Object Structure for this, we can update the URL.
        const maximoUrl = 'https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxlabor?oslc.select=laborcode,person{personid,displayname,timezone,addressline1,city,stateprovince,postalcode},laborcraftrate{craft}&oslc.pageSize=200';

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
        
        const deduplicatedMap = new Map<string, any>();
        
        // Process the OSLC response
        const members = data['rdfs:member'] || data.member || [];
        
        members.forEach((labor: any) => {
            // Filter by craft
            const crafts = labor['spi:laborcraftrate'] || [];
            const hasCorrectCraft = crafts.some((c: any) => c['spi:craft'] === 'SOLAR_ELECTRICIAN_1');
            
            if (!hasCorrectCraft) return;

            const person = (labor['spi:person'] && labor['spi:person'][0]) || {};
            const personId = person['spi:personid'] || labor['spi:laborcode'];
            
            if (!deduplicatedMap.has(personId)) {
                // Dynamically compile physical string, purging null segments natively
                const addressNode = [person['spi:addressline1'], person['spi:city'], person['spi:stateprovince']].filter(Boolean).join(', ');
                const finalAddressString = addressNode ? `${addressNode} ${person['spi:postalcode'] || ''}`.trim() : null;

                deduplicatedMap.set(personId, {
                    id: personId,
                    name: person['spi:displayname'] || labor['spi:laborcode'] || 'Unknown Tech',
                    timezone: person['spi:timezone'] || 'America/New_York', // Natively map timezone
                    region: 'Midwest', // Hardcoded fallback for now until we map persongroupteam via OSLC
                    homeAddress: finalAddressString || 'Unknown', 
                    skills: crafts.map((c: any) => c['spi:craft']).filter(Boolean)
                });
            }
        });

        const finalRoster = Array.from(deduplicatedMap.values());
        return NextResponse.json(finalRoster);
        
    } catch (err: any) {
        console.error("Technician API Error:", err);
        return NextResponse.json({ error: 'Maximo API connection failed', details: err.message }, { status: 500 });
    }
}
