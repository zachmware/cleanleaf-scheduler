require('dotenv').config({path: '.env.local'});
const auth = Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64');
const headers = { 'Content-Type': 'application/json', 'maxauth': auth, 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

async function run() {
  // Get all RTS wonums
  const res = await fetch('https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=2000&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc', { headers });
  const d = await res.json();
  const all = d.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
  const rts = all.filter(a => a.Attributes?.STATUS?.content === 'None');
  const wonums = [...new Set(rts.map(a => a.Attributes?.WONUM?.content).filter(Boolean))];
  console.log('Unique RTS WONUMs:', wonums.length);

  // Fetch first 50 by wonum directly
  const chunk = wonums.slice(0, 50);
  const wStr = chunk.map(w => `"${w}"`).join(',');
  const selectParams = 'wonum,status,description,worktype,estdur,woserviceaddress{description,streetaddress,city,stateprovince,postalcode},locations{region}';
  const r2 = await fetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=${encodeURIComponent(`wonum in [${wStr}]`)}&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=500`, { headers });
  const d2 = await r2.json();
  const wos = d2['rdfs:member'] || [];
  
  const sts = {};
  wos.forEach(w => { sts[w['spi:status']] = (sts[w['spi:status']] || 0) + 1; });
  console.log('WO statuses:', sts);
  console.log('Returned:', wos.length);
  
  // Check descriptions for case type hints
  const newwo = wos.filter(w => w['spi:status'] === 'NEWWO');
  console.log('NEWWO:', newwo.length);
  
  const maint = newwo.filter(w => (w['spi:description']||'').toLowerCase().includes('maintenance'));
  const reactive = newwo.filter(w => !(w['spi:description']||'').toLowerCase().includes('maintenance'));
  console.log('Maintenance (by description):', maint.length);
  console.log('Reactive (by description):', reactive.length);
  
  maint.slice(0, 3).forEach(w => console.log('  MAINT:', w['spi:description']?.substring(0, 80)));
  reactive.slice(0, 3).forEach(w => console.log('  REACT:', w['spi:description']?.substring(0, 80)));
}

run().catch(e => console.error(e));
