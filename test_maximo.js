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
        console.log("Testing MXLABOR craft filter...");
        const resLabor = await fetch('https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxlabor?oslc.select=laborcode,laborcraftrate{craft}&oslc.pageSize=5', { headers });
        const dataLabor = await resLabor.json();
        console.log("Labor keys:", JSON.stringify(dataLabor['rdfs:member'], null, 2));
    } catch (e) {
        console.error("Query Failed:", e.message);
    }
}

testMaximo();
