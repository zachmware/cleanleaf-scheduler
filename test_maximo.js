require('dotenv').config({ path: '.env.local' });

async function testMaximo() {
    const username = process.env.MAXIMO_USER;
    const password = process.env.MAXIMO_PASS;
    const encodedAuth = Buffer.from(`${username}:${password}`).toString('base64');
    
    const headers = {
        'Content-Type': 'application/json',
        'maxauth': encodedAuth,
        'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc'
    };
    try {
        console.log("Testing recent 200 WOADDITIONALRESOURCE for None...");
        const maximoUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=200&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc`;
        const resWO = await fetch(maximoUrl, { headers });
        if (resWO.ok) {
            const dataWO = await resWO.json();
            const arr = dataWO.WOADDITIONALRESOURCEMboSet.WOADDITIONALRESOURCE;
            const noneCount = arr.filter(a => a.Attributes.STATUS && a.Attributes.STATUS.content === 'None').length;
            console.log(`Found ${noneCount} 'None' records in the last 200 created resources.`);
        } else {
            console.log("MBO Failed:", await resWO.text());
        }
    } catch (e) {
        console.error("Query Failed:", e.message);
    }
}

testMaximo();
