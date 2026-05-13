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
        console.log("Testing mxlabor for GENERALLABOR...");
        const maximoUrl = 'https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxlabor?oslc.where=laborcode="GENERALLABOR"&oslc.select=laborcode,person{personid},laborcraftrate{craft}';
        const response = await fetch(maximoUrl, { headers });
        const data = await response.json();
        console.log("Labor:", JSON.stringify(data['rdfs:member'], null, 2));
    } catch (e) {
        console.error("Query Failed:", e.message);
    }
}

testMaximo();
