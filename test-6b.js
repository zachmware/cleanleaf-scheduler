require('dotenv').config({path: '.env.local'});
const auth = Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64');
const headers = { 'Content-Type': 'application/json', 'maxauth': auth, 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

async function run() {
    // Get STAGE6B SRs
    const r1 = await fetch('https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=status="STAGE6B"&oslc.select=ticketid,status&oslc.pageSize=2000', {headers});
    const d1 = await r1.json();
    const s6bIds = new Set((d1['rdfs:member']||[]).map(s => String(s['spi:ticketid'])));
    console.log('STAGE6B SRs:', s6bIds.size);

    // Get current RTS from our API 
    const r2 = await fetch('http://localhost:3000/api/workorders');
    const wo = await r2.json();
    
    // Get RTS locations
    const rtsLocMap = new Map();
    wo.rtsOrders?.forEach(o => {
        if (!rtsLocMap.has(o.location)) rtsLocMap.set(o.location, []);
        rtsLocMap.get(o.location).push(o.caseNumber);
    });
    console.log('Unique STAGE6 RTS locations:', rtsLocMap.size);
    
    // Now get ALL WOs from AR with status=None and find the 6B ones
    const arRes = await fetch('https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=2000&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc', {headers});
    const arData = await arRes.json();
    const allAR = arData.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
    const rtsAR = allAR.filter(a => a.Attributes?.STATUS?.content === 'None');
    const rtsWonums = [...new Set(rtsAR.map(a => a.Attributes?.WONUM?.content).filter(Boolean))];
    
    // Fetch WO details for a sample to find STAGE6B ones
    const chunk = rtsWonums.slice(0, 200);
    const wStr = chunk.map(w => `"${w}"`).join(',');
    const sel = 'wonum,status,description,location';
    const r3 = await fetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=${encodeURIComponent(`wonum in [${wStr}]`)}&oslc.select=${encodeURIComponent(sel)}&oslc.pageSize=500`, {headers});
    const d3 = await r3.json();
    const wos = d3['rdfs:member'] || [];
    
    console.log('\nSTAGE6B WOs found in sample:');
    let found6b = 0;
    for (const w of wos) {
        const desc = w['spi:description'] || '';
        const m = desc.match(/\[From Case\s+(\d+)\]/i);
        const caseNum = m ? m[1] : null;
        if (caseNum && s6bIds.has(caseNum)) {
            found6b++;
            const loc = w['spi:location'] || 'UNKNOWN';
            const hasStage6AtLoc = rtsLocMap.has(loc);
            console.log(`  WO ${w['spi:wonum']} | case: ${caseNum} | loc: ${loc} | has STAGE6 at same loc: ${hasStage6AtLoc} | STAGE6 cases: ${rtsLocMap.get(loc)?.join(',') || 'none'}`);
        }
    }
    console.log(`\nTotal 6B in sample: ${found6b} / ${wos.length}`);
}

run().catch(e => console.error(e));
