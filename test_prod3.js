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
        const s = Date.now();
        console.log("Fetching side and SRs...");
        const [resSide, resSched, resSr] = await Promise.all([
            fetch(`https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=2000&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc`, { headers }).then(r=>r.json()),
            fetch(`https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=120&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=SCHEDSTART%20desc`, { headers }).then(r=>r.json()),
            fetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=status="STAGE6"&oslc.select=ticketid,status&oslc.pageSize=2000`, { headers }).then(r=>r.json())
        ]);
        
        console.log("Side and SR fetched in " + (Date.now()-s) + "ms");

        const allSide = resSide.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
        const allSched = resSched.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
        const allSrs = resSr['rdfs:member'] || [];

        const rtsWonums = new Set(allSide.filter(a => a.Attributes?.STATUS?.content === 'None').map(a => a.Attributes?.WONUM?.content));
        const schedWonums = new Set(allSched.map(a => a.Attributes?.WONUM?.content));
        
        const allRelevantWonums = new Set([...rtsWonums, ...schedWonums].filter(Boolean));
        console.log(`Relevant WONUMs: ${allRelevantWonums.size}`);

        const uniqueSrs = Array.from(new Set(allSrs.map(sr => sr['spi:ticketid']).filter(Boolean)));
        console.log(`Unique STAGE6 SRs: ${uniqueSrs.length}`);

        const chunkTasks = [];
        for (let i = 0; i < uniqueSrs.length; i += 80) {
            const chunk = uniqueSrs.slice(i, i + 80);
            const srStr = chunk.map(w => `"${w}"`).join(',');
            const osUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=status="NEWWO" and origrecordid in [${encodeURIComponent(srStr)}]&oslc.select=wonum,status,origrecordid,description,worktype,jobtype_description,wopriority,statusdate,client,vendor,location,estdur,woserviceaddress{description,streetaddress,city,stateprovince,postalcode},locations{region}&oslc.pageSize=500`;
            chunkTasks.push(() => fetch(osUrl, { headers }).then(r=>r.json()).then(j=>j['rdfs:member']||[]));
        }

        console.log(`Fetching WO Details in ${chunkTasks.length} chunks...`);
        const chunkResults = await executeInBatches(chunkTasks, 10);
        let validWos = [];
        for (const res of chunkResults) validWos = validWos.concat(res);

        console.log(`Valid WOs with NEWWO and STAGE6: ${validWos.length}`);

        let rtsFinal = 0;
        let schedFinal = 0;

        for (const wo of validWos) {
            const wonum = wo['spi:wonum'];
            if (rtsWonums.has(wonum)) rtsFinal++;
            if (schedWonums.has(wonum)) schedFinal++;
        }

        console.log(`Final RTS Items: ${rtsFinal}`);
        console.log(`Final Sched Items: ${schedFinal}`);
        console.log("Total time: " + (Date.now()-s) + "ms");

    } catch(e) {
        console.error("Error:", e.message);
    }
}
test();
