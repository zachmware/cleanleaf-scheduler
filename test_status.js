require('dotenv').config({path: '.env.local'});
const headers = { maxauth: Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64'), 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

async function test() {
    try {
        const url = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=status="RTBSCH"&oslc.select=status,wonum&oslc.pageSize=1`;
        const res = await fetch(url, { headers });
        const json = await res.json();
        console.log("Count:", json.responseInfo?.totalCount || (json['rdfs:member']||json.member||[]).length, "items found (could be more if > 1, totalCount not returned)");
        
        // Count accurately
        const url2 = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/workorder?_format=json&status=~eq~RTBSCH&_maxItems=1`;
        const res2 = await fetch(url2, { headers });
        const json2 = await res2.json();
        console.log("MBO RTBSCH found:", Object.keys(json2.WORKORDERMboSet?.WORKORDER||{}).length);

    } catch(e) {
        console.error("Error:", e.message);
    }
}
test();
