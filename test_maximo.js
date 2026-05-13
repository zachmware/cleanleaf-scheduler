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
        console.log("Testing IN operator for wonum...");
        const selectParams = 'wonum,description,status';
        const maximoUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=wonum in ["150700","135791"]&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=5`;
        const resWO = await fetch(maximoUrl, { headers });
        const dataWO = await resWO.json();
        console.log("Response:", JSON.stringify(dataWO['rdfs:member'], null, 2));
    } catch (e) {
        console.error("Query Failed:", e.message);
    }
}

testMaximo();
