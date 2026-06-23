require('dotenv').config({path: '.env.local'});
const auth = Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64');
const headers = { 'Content-Type': 'application/json', 'maxauth': auth, 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

// 1. Fetch REGION domain values
fetch('https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/alndomain?_format=json&_maxItems=100&domainid=~eq~REGION', { headers })
  .then(r => r.json())
  .then(data => {
    const regions = data.ALNDOMAINMboSet?.ALNDOMAIN || [];
    console.log('=== REGION Domain Values ===');
    regions.forEach(r => {
      console.log(`  "${r.Attributes?.VALUE?.content}" (desc: "${r.Attributes?.DESCRIPTION?.content}")`);
    });
  })
  .catch(e => console.error('Region domain error:', e));

// 2. Sample a few WOs to see what locations.region returns
fetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=status="NEWWO"&oslc.select=wonum,location,woserviceaddress{description,streetaddress,city,stateprovince,postalcode,stateprovince_description},locations{region,description}&oslc.pageSize=20`, { headers })
  .then(r => r.json())
  .then(data => {
    const members = data['rdfs:member'] || [];
    console.log('\n=== Sample WO Regions ===');
    members.forEach(wo => {
      const addr = wo['spi:woserviceaddress']?.[0] || {};
      const loc = wo['spi:locations']?.[0] || {};
      console.log(`  WO ${wo['spi:wonum']}: loc.region="${loc['spi:region']}" state="${addr['spi:stateprovince']}" city="${addr['spi:city']}"`);
    });
  })
  .catch(e => console.error('WO sample error:', e));
