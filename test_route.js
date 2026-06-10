require('dotenv').config({path: '.env.local'});
const headers = { maxauth: Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64'), 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

async function test() {
    try {
        const sideUrl = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=50&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc`;
        const resSide = await fetch(sideUrl, { method: 'GET', headers });
        const dataSide = await resSide.json();
        const allSide = dataSide.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
        const rtsWonums = allSide.filter(a => a.Attributes?.STATUS?.content === 'None').map(a => a.Attributes?.WONUM?.content).filter(Boolean);
        
        const wonumStr = rtsWonums.slice(0, 50).map(w => `"${w}"`).join(',');
        const osUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=wonum%20in%20[${encodeURIComponent(wonumStr)}]&oslc.select=status,wonum&oslc.pageSize=100`;
        const resWo = await fetch(osUrl, { headers });
        const json = await resWo.json();
        console.log("Statuses:", (json['rdfs:member']||[]).map(w=>w['spi:status']));
    } catch(e) {
        console.error("Error:", e.message);
    }
}
test();
