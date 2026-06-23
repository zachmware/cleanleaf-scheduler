require('dotenv').config({path: '.env.local'});
const auth = Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64');
const headers = { 'Content-Type': 'application/json', 'maxauth': auth, 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

// Today's date
const today = new Date().toISOString().split('T')[0];
console.log('Today:', today);

// Fetch scheduled resources (the same query as route.ts)
fetch('https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=800&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=SCHEDSTART%20desc', { headers })
  .then(r => r.json())
  .then(data => {
    const all = data.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
    const scheduled = all.filter(a => a.Attributes?.STATUS?.content !== 'None' && a.Attributes?.SCHEDSTART);
    
    // Filter to today
    const todayItems = scheduled.filter(a => {
      const start = a.Attributes?.SCHEDSTART?.content || '';
      return start.includes(today);
    });
    
    console.log(`Total scheduled resources: ${scheduled.length}`);
    console.log(`Today's scheduled (${today}): ${todayItems.length}`);
    todayItems.forEach(a => {
      console.log(`  WO: ${a.Attributes?.WONUM?.content}, Tech: ${a.Attributes?.PERSONID?.content}, Start: ${a.Attributes?.SCHEDSTART?.content}, Status: ${a.Attributes?.STATUS?.content}`);
    });
    
    // Also show unique statuses
    const statuses = new Set(all.map(a => a.Attributes?.STATUS?.content));
    console.log('\nAll unique statuses:', [...statuses]);
    
    // Show first few scheduled dates
    console.log('\nFirst 10 scheduled dates:');
    scheduled.slice(0, 10).forEach(a => {
      console.log(`  ${a.Attributes?.SCHEDSTART?.content} - WO: ${a.Attributes?.WONUM?.content} (${a.Attributes?.STATUS?.content})`);
    });
  })
  .catch(e => console.error(e));
