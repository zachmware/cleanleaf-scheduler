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
        console.log("Testing MBO REST API for alndomain...");
        const maximoUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/alndomain?_format=json&_maxItems=50&domainid=~eq~REGION`;
        const resWO = await fetch(maximoUrl, { headers });
        if (resWO.ok) {
            const dataWO = await resWO.json();
            console.log("MBO Response:", JSON.stringify(dataWO, null, 2).substring(0, 5000));
        } else {
            console.log("MBO Failed:", await resWO.text());
        }
    } catch (e) {
        console.error("Query Failed:", e.message);
    }
}

testMaximo();
