require('dotenv').config({ path: '.env.local' });

const encodedAuth = Buffer.from(`${process.env.MAXIMO_USER}:${process.env.MAXIMO_PASS}`).toString('base64');

const headers = {
    'Content-Type': 'application/json',
    'maxauth': encodedAuth,
    'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc'
};

async function run() {
    try {
        console.log("Checking mxlabor count...");
        const osUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxlabor?oslc.select=laborcode`;
        const resOs = await fetch(osUrl, { method: 'GET', headers });
        if (resOs.ok) {
            const dataOs = await resOs.json();
            const members = dataOs['rdfs:member'] || dataOs.member || [];
            console.log("Total mxlabor fetched without pageSize:", members.length);
        }
    } catch(e) {
        console.error("ERROR:", e);
    }
}
run();
