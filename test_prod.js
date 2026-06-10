require('dotenv').config({path: '.env.local'});
const headers = { maxauth: Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64'), 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

const executeInBatches = async (tasks, batchSize = 5) => {
    let results = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(t => t()));
        results = results.concat(batchResults);
    }
    return results;
};

async function test() {
    try {
        console.log("Fetching woadditionalresource...");
        const sideUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=2000&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc`;
        const resSide = await fetch(sideUrl, { headers });
        const allSide = (await resSide.json()).WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
        const rtsResources = allSide.filter(a => a.Attributes?.STATUS?.content === 'None');
        const rtsWonums = rtsResources.map(a => a.Attributes?.WONUM?.content).filter(Boolean);
        console.log(`Found ${rtsWonums.length} 'None' assignments.`);

        const uniqueWonums = Array.from(new Set(rtsWonums));
        console.log(`Fetching WO details for ${uniqueWonums.length} unique wonums...`);
        
        let woDetails = [];
        const chunkTasks = [];
        for (let i = 0; i < uniqueWonums.length; i += 50) {
            const chunk = uniqueWonums.slice(i, i + 50);
            const wonumStr = chunk.map(w => `"${w}"`).join(',');
            const osUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=wonum%20in%20[${encodeURIComponent(wonumStr)}]&oslc.select=wonum,status,origrecordid&oslc.pageSize=100`;
            chunkTasks.push(() => fetch(osUrl, { headers }).then(r=>r.json()).then(j=>j['rdfs:member']||[]));
        }
        const chunkResults = await executeInBatches(chunkTasks, 5);
        for (const res of chunkResults) woDetails = woDetails.concat(res);
        console.log(`Fetched ${woDetails.length} WO Details.`);
        
        const rawRtsDetails = woDetails.filter(wo => rtsWonums.includes(wo['spi:wonum']));
        let rtsDetails = rawRtsDetails.filter(wo => wo['spi:status'] === 'NEWWO');
        console.log(`Found ${rtsDetails.length} with NEWWO status.`);
        
        const ticketIds = Array.from(new Set(rtsDetails.map(wo => wo['spi:origrecordid']).filter(Boolean)));
        console.log(`Found ${ticketIds.length} unique ticket IDs (SRs).`);
        
        const srStatusMap = new Map();
        if (ticketIds.length > 0) {
            const srTasks = [];
            for (let i = 0; i < ticketIds.length; i += 50) {
                const chunk = ticketIds.slice(i, i + 50);
                const ticketStr = chunk.map(t => `"${t}"`).join(',');
                const srUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=ticketid%20in%20[${encodeURIComponent(ticketStr)}]&oslc.select=ticketid,status&oslc.pageSize=100`;
                srTasks.push(() => fetch(srUrl, { headers }).then(r=>r.json()).then(j=>j['rdfs:member']||[]));
            }
            const srResults = await executeInBatches(srTasks, 5);
            for (const res of srResults) {
                res.forEach(sr => {
                    if (sr['spi:ticketid'] && sr['spi:status']) srStatusMap.set(sr['spi:ticketid'], sr['spi:status']);
                });
            }
        }
        
        rtsDetails = rtsDetails.filter(wo => srStatusMap.get(wo['spi:origrecordid']) === 'STAGE6');
        console.log(`FINAL STAGE6 RTS Items: ${rtsDetails.length}`);

    } catch(e) {
        console.error("Error:", e.message);
    }
}
test();
