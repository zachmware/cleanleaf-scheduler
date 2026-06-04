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
        const headers = {
            'Content-Type': 'application/json',
            'maxauth': encodedAuth,
            'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc'
        };
        
        // 1. Fetch valid Region domains
        const domainUrl = 'https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/alndomain?_format=json&_maxItems=100&domainid=~eq~REGION';
        const resDomain = await fetch(domainUrl, { method: 'GET', headers });
        let validRegions = new Set<string>();
        let validRegionMap = new Map<string, string>(); // uppercase -> original casing
        if (resDomain.ok) {
            const dataDomain = await resDomain.json();
            const regions = dataDomain.ALNDOMAINMboSet?.ALNDOMAIN || [];
            regions.forEach((r: any) => {
                if (r.Attributes && r.Attributes.VALUE && r.Attributes.VALUE.content) {
                    const rName = r.Attributes.VALUE.content;
                    validRegions.add(rName.toUpperCase());
                    validRegionMap.set(rName.toUpperCase(), rName); // Keep original casing
                }
            });
        }
        
        // 2. Fetch Technicians
        const maximoUrl = 'https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxlabor?oslc.select=laborcode,person{personid,displayname,timezone,addressline1,city,stateprovince,postalcode},laborcraftrate{craft}&oslc.pageSize=200';
        const response = await fetch(maximoUrl, { method: 'GET', headers });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Maximo API returned ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const deduplicatedMap = new Map<string, any>();
        const members = data['rdfs:member'] || data.member || [];
        
        members.forEach((labor: any) => {
            const crafts = labor['spi:laborcraftrate'] || [];
            const hasCorrectCraft = crafts.some((c: any) => c['spi:craft'] === 'SOLAR_ELECTRICIAN_1' || c['spi:craft'] === 'TECH');
            
            if (!hasCorrectCraft) return;

            const person = (labor['spi:person'] && labor['spi:person'][0]) || {};
            const personId = person['spi:personid'] || labor['spi:laborcode'];
            
            if (!deduplicatedMap.has(personId)) {
                const addressNode = [person['spi:addressline1'], person['spi:city'], person['spi:stateprovince']].filter(Boolean).join(', ');
                const finalAddressString = addressNode ? `${addressNode} ${person['spi:postalcode'] || ''}`.trim() : null;

                deduplicatedMap.set(personId, {
                    id: personId,
                    name: person['spi:displayname'] || labor['spi:laborcode'] || 'Unknown Tech',
                    timezone: person['spi:timezone'] || 'America/New_York',
                    region: 'Midwest', // Default fallback
                    homeAddress: finalAddressString || 'Unknown', 
                    skills: crafts.map((c: any) => c['spi:craft']).filter(Boolean)
                });
            }
        });

        const finalRoster = Array.from(deduplicatedMap.values());
        
        // 3. Resolve PersonGroup (Region) for each Technician via MBO REST
        const rosterPromises = finalRoster.map(async (tech) => {
            try {
                const url = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/persongroupteam?_format=json&_maxItems=20&respparty=~eq~${tech.id}`;
                const resTeam = await fetch(url, { headers });
                if (resTeam.ok) {
                    const dataTeam = await resTeam.json();
                    const groups = dataTeam.PERSONGROUPTEAMMboSet?.PERSONGROUPTEAM || [];
                    for (const group of groups) {
                        const pGroup = group.Attributes?.PERSONGROUP?.content;
                        if (pGroup) {
                            const upperGroup = pGroup.toUpperCase();
                            if (validRegions.has(upperGroup)) {
                                tech.region = validRegionMap.get(upperGroup); // Map to original casing
                                break;
                            }
                        }
                    }
                }
            } catch (e) {
                // Silently fallback to Midwest on error
            }
            return tech;
        });

        const completedRoster = await Promise.all(rosterPromises);
        return NextResponse.json(completedRoster);
        
    } catch (err: any) {
        console.error("Technician API Error:", err);
        return NextResponse.json({ error: 'Maximo API connection failed', details: err.message }, { status: 500 });
    }
}
