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
        console.log("Testing exact application query...");
        const selectParams = 'wonum,description,worktype,origrecordid,jobtype_description,wopriority,statusdate,client,vendor,location,estdur,woserviceaddress{description,streetaddress,city,stateprovince,postalcode}';
        const maximoUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=status="NEWWO" and origrecordid="*"&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=1`;
        const resWO = await fetch(maximoUrl, { headers });
        const dataWO = await resWO.json();
        console.log("WO details:", JSON.stringify(dataWO['rdfs:member'], null, 2));
    } catch (e) {
        console.error("Query Failed:", e.message);
    }
}

testMaximo();
