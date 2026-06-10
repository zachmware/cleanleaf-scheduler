require('dotenv').config({path: '.env.local'});
const headers = { maxauth: Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64'), 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

async function test() {
    try {
        const selectParams = 'wonum,status,origrecordid,relatedrecord{relatedrecclass,relatedreckey}';
        const url = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=status="NEWWO"&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=2`;
        const res = await fetch(url, { headers });
        const json = await res.json();
        console.log("Related:", JSON.stringify(json['rdfs:member'], null, 2));
    } catch(e) {
        console.error("Error:", e.message);
    }
}
test();
