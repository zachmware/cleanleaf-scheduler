require('dotenv').config({path: '.env.local'});
const auth = Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64');
const headers = { 'Content-Type': 'application/json', 'maxauth': auth, 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

// Get today's scheduled WONUMs
fetch('https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=800&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=SCHEDSTART%20desc', { headers })
  .then(r => r.json())
  .then(async data => {
    const all = data.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
    const scheduled = all.filter(a => a.Attributes?.STATUS?.content !== 'None' && a.Attributes?.SCHEDSTART);
    const today = '2026-06-23';
    const todayItems = scheduled.filter(a => (a.Attributes?.SCHEDSTART?.content || '').includes(today));
    
    const todayWonums = [...new Set(todayItems.map(a => a.Attributes?.WONUM?.content))];
    console.log(`Today's unique WONUMs: ${todayWonums.length}`);
    
    // Now check which of these are in the STAGE6 SR -> WO pipeline
    // Fetch the WOs directly by wonum to see their status and origrecordid
    const chunk = todayWonums.slice(0, 40);
    const wonumFilter = chunk.map(w => `"${w}"`).join(',');
    const url = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=${encodeURIComponent(`wonum in [${wonumFilter}]`)}&oslc.select=wonum,status,origrecordid&oslc.pageSize=500`;
    
    const res2 = await fetch(url, { headers });
    const data2 = await res2.json();
    const wos = data2['rdfs:member'] || [];
    
    console.log('\nToday WO statuses:');
    wos.forEach(wo => {
      console.log(`  WO ${wo['spi:wonum']}: status="${wo['spi:status']}" origrecordid="${wo['spi:origrecordid']}"`);
    });
    
    // Now check if those origrecordids are STAGE6
    const srIds = [...new Set(wos.map(wo => wo['spi:origrecordid']).filter(Boolean))];
    console.log(`\nUnique SRs for today's WOs: ${srIds.length}`);
    
    if (srIds.length > 0) {
      const srFilter = srIds.slice(0, 30).map(s => `"${s}"`).join(',');
      const srUrl = `https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=${encodeURIComponent(`ticketid in [${srFilter}]`)}&oslc.select=ticketid,status&oslc.pageSize=500`;
      const res3 = await fetch(srUrl, { headers });
      const data3 = await res3.json();
      const srs = data3['rdfs:member'] || [];
      console.log('\nSR statuses for today scheduled WOs:');
      const statusCounts = {};
      srs.forEach(sr => {
        const st = sr['spi:status'];
        statusCounts[st] = (statusCounts[st] || 0) + 1;
      });
      console.log(statusCounts);
    }
  })
  .catch(e => console.error(e));
