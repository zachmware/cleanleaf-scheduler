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
        console.log("Testing MXAPIWODETAIL for NEWWO with tickets...");
        const resWO = await fetch('https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=status="NEWWO" and origrecordid="*"&oslc.select=wonum,origrecordid,origrecordclass,ticketid&oslc.pageSize=5', { headers });
        const dataWO = await resWO.json();
        console.log("WO with ticket data:", JSON.stringify(dataWO['rdfs:member'], null, 2));
    } catch (e) {
        console.error("Query Failed:", e.message);
    }
}

testMaximo();
