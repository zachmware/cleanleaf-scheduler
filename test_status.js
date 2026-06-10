require('dotenv').config({path: '.env.local'});
const headers = { maxauth: Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64'), 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

async function test() {
    try {
        // 1. Get a few recent None assignments
        const sideUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=200&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc`;
        const resSide = await fetch(sideUrl, { method: 'GET', headers });
        const allSide = (await resSide.json()).WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
        const rtsWonums = allSide.filter(a => a.Attributes?.STATUS?.content === 'None').map(a => a.Attributes.WONUM.content).filter(Boolean);
        
        // 2. Fetch WO Details
        const wonumStr = rtsWonums.slice(0, 50).map(w => `"${w}"`).join(',');
        const osUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=wonum%20in%20[${encodeURIComponent(wonumStr)}]&oslc.select=wonum,status,origrecordid,origrecordclass&oslc.pageSize=100`;
        const resWo = await fetch(osUrl, { headers });
        const dataWo = await resWo.json();
        const wos = (dataWo['rdfs:member'] || dataWo.member || []).filter(wo => wo['spi:status'] === 'NEWWO' && wo['spi:origrecordid']);
        
        // 3. Extract ticketids and fetch SRs
        const ticketIds = wos.map(wo => wo['spi:origrecordid']).filter(Boolean);
        const ticketStr = ticketIds.map(t => `"${t}"`).join(',');
        const srUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=ticketid%20in%20[${encodeURIComponent(ticketStr)}]&oslc.select=ticketid,status&oslc.pageSize=100`;
        const resSr = await fetch(srUrl, { headers });
        const dataSr = await resSr.json();
        
        const srs = dataSr['rdfs:member'] || [];
        const srStatusMap = new Map();
        srs.forEach(sr => srStatusMap.set(sr['spi:ticketid'], sr['spi:status']));
        
        console.log("WOs with their SR Status:");
        wos.forEach(wo => {
            console.log(`WO: ${wo['spi:wonum']}, SR: ${wo['spi:origrecordid']}, Class: ${wo['spi:origrecordclass']}, SR Status: ${srStatusMap.get(wo['spi:origrecordid']) || 'Unknown'}`);
        });

    } catch(e) {
        console.error("Error:", e.message);
    }
}
test();
