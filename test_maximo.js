require('dotenv').config({ path: '.env.local' });

const headers = {
    'Content-Type': 'application/json',
    'maxauth': Buffer.from(`${process.env.MAXIMO_USER}:${process.env.MAXIMO_PASS}`).toString('base64'),
    'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc'
};

async function run() {
    try {
        console.log("Fetching WO resources...");
        const sideUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=300&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc`;
        const resSide = await fetch(sideUrl, { method: 'GET', headers });
        let rtsResources = [];
        if (resSide.ok) {
            const dataSide = await resSide.json();
            const allSide = dataSide.WOADDITIONALRESOURCEMboSet.WOADDITIONALRESOURCE || [];
            rtsResources = allSide.filter(a => a.Attributes.STATUS && a.Attributes.STATUS.content === 'None');
        }

        const schedUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=500&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=SCHEDSTART%20desc`;
        const resSched = await fetch(schedUrl, { method: 'GET', headers });
        let scheduledResources = [];
        if (resSched.ok) {
            const dataSched = await resSched.json();
            const allSched = dataSched.WOADDITIONALRESOURCEMboSet.WOADDITIONALRESOURCE || [];
            scheduledResources = allSched.filter(a => a.Attributes.STATUS && a.Attributes.STATUS.content !== 'None' && a.Attributes.SCHEDSTART);
        }

        console.log("Extracting wonums...");
        const rtsWonums = rtsResources.map(a => a.Attributes.WONUM.content).filter(Boolean);
        const schedWonums = scheduledResources.map(a => a.Attributes.WONUM.content).filter(Boolean);
        
        console.log("RTS wonums length:", rtsWonums.length);
        console.log("Sched wonums length:", schedWonums.length);
        console.log("Done");
    } catch(e) {
        console.error("ERROR:", e);
    }
}
run();
