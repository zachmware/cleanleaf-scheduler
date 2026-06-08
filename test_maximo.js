require('dotenv').config({ path: '.env.local' });

const headers = {
    'Content-Type': 'application/json',
    'maxauth': Buffer.from(`${process.env.MAXIMO_USER}:${process.env.MAXIMO_PASS}`).toString('base64'),
    'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc'
};

async function run() {
    try {
        console.log("Fetching WO resources...");
        const sideUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=1&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc`;
        const resSide = await fetch(sideUrl, { method: 'GET', headers });
        let wonum = null;
        if (resSide.ok) {
            const dataSide = await resSide.json();
            const allSide = dataSide.WOADDITIONALRESOURCEMboSet.WOADDITIONALRESOURCE || [];
            if (allSide.length > 0) wonum = allSide[0].Attributes.WONUM.content;
        }

        if (wonum) {
            const osUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=wonum="${wonum}"&oslc.select=*`;
            const resOs = await fetch(osUrl, { method: 'GET', headers });
            const dataOs = await resOs.json();
            const wo = dataOs['rdfs:member'][0];
            const locStr = wo['spi:location'];
            console.log("Found WO location:", locStr);

            const locUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/locations?_format=json&location=~in~908-2080,908-1537`;
            const resLoc = await fetch(locUrl, { method: 'GET', headers });
            const dataLoc = await resLoc.json();
            console.log("IN length:", dataLoc?.LOCATIONSMboSet?.LOCATIONS?.length);
        }
    } catch(e) {
        console.error("ERROR:", e);
    }
}
run();
