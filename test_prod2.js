require('dotenv').config({path: '.env.local'});
const headers = { maxauth: Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64'), 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

async function test() {
    try {
        const s = Date.now();
        console.log("Fetching concurrently...");
        const [resWo, resSr, resSide, resSched] = await Promise.all([
            // 1. Fetch NEWWO WOs
            fetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=status="NEWWO"&oslc.select=wonum,status,origrecordid,description,worktype,jobtype_description,wopriority,statusdate,client,vendor,location,estdur,woserviceaddress{description,streetaddress,city,stateprovince,postalcode},locations{region}&oslc.pageSize=2000`, { headers }).then(r=>r.json()),
            
            // 2. Fetch STAGE6 SRs
            fetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=status="STAGE6"&oslc.select=ticketid,status&oslc.pageSize=2000`, { headers }).then(r=>r.json()),
            
            // 3. Fetch None assignments (RTS)
            fetch(`https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=2000&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc`, { headers }).then(r=>r.json()),

            // 4. Fetch Scheduled assignments (Gantt)
            fetch(`https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=120&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=SCHEDSTART%20desc`, { headers }).then(r=>r.json())
        ]);
        console.log("Fetch complete in " + (Date.now()-s) + "ms");

        const allWos = resWo['rdfs:member'] || [];
        const allSrs = resSr['rdfs:member'] || [];
        const rtsRes = resSide.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
        const schedRes = resSched.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];

        // Map SR statuses
        const srStatusMap = new Map();
        for (const sr of allSrs) {
            if (sr['spi:ticketid']) srStatusMap.set(sr['spi:ticketid'], sr['spi:status']);
        }

        // Filter WOs to only those with NEWWO AND STAGE6 SR
        const validWosMap = new Map();
        for (const wo of allWos) {
            const tid = wo['spi:origrecordid'];
            if (wo['spi:status'] === 'NEWWO' && tid && srStatusMap.get(tid) === 'STAGE6') {
                validWosMap.set(wo['spi:wonum'], wo);
            }
        }

        console.log(`Valid WOs: ${validWosMap.size}`);

        // Extract scheduled and RTS items that are in validWosMap
        const rtsOrders = [];
        for (const a of rtsRes) {
            const wonum = a.Attributes?.WONUM?.content;
            if (a.Attributes?.STATUS?.content === 'None' && validWosMap.has(wonum)) {
                rtsOrders.push(validWosMap.get(wonum));
                // ensure no dupes if we only need unique WOs: validWosMap.delete(wonum);
            }
        }

        console.log(`Final RTS Items: ${rtsOrders.length}`);
        console.log("Total time: " + (Date.now()-s) + "ms");

    } catch(e) {
        console.error("Error:", e.message);
    }
}
test();
