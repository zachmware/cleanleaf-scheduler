require('dotenv').config({ path: '.env.local' });

const headers = {
    'Content-Type': 'application/json',
    'maxauth': Buffer.from(`${process.env.MAXIMO_USER}:${process.env.MAXIMO_PASS}`).toString('base64'),
    'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc'
};

async function run() {
    try {
        console.log("Fetching a few WOs to get a location...");
        const osUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.select=wonum,location&oslc.pageSize=5`;
        const resOs = await fetch(osUrl, { method: 'GET', headers });
        if (resOs.ok) {
            const dataOs = await resOs.json();
            const wos = dataOs['rdfs:member'] || [];
            console.log("WOs:", JSON.stringify(wos, null, 2));

            if (wos.length > 0 && wos[0]['spi:location']) {
                const locStr = wos[0]['spi:location'];
                console.log("Querying MBO Locations for Region:");
                const locUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/locations?_format=json&region=~like~%25&_inclCol=location,region&_maxItems=5`;
                const resLoc = await fetch(locUrl, { method: 'GET', headers });
                if (resLoc.ok) {
                    const dataLoc = await resLoc.json();
                    console.log("MBO Location Data with Region:", JSON.stringify(dataLoc, null, 2).substring(0, 5000));
                } else {
                    console.log("MBO Location fetch failed:", await resLoc.text());
                }
            }
        } else {
            console.log("WO fetch failed:", await resOs.text());
        }
    } catch(e) {
        console.error("ERROR:", e);
    }
}
run();
