require('dotenv').config({path: '.env.local'});
const auth = Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64');
const d = new Date();
d.setDate(d.getDate() - 2);
const startStr = d.toISOString().split('T')[0] + 'T00:00:00'; // e.g. 2026-06-13T00:00:00
const url = `https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=100&_inclCol=personid,schedstart,status,wonum&schedstart=~gte~${startStr}`;
fetch(url, {headers:{maxauth: auth}})
  .then(async r => {
      if(!r.ok) console.log('Error:', await r.text());
      else {
          const j = await r.json();
          console.log('Success!', j.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE?.length);
      }
  }).catch(e=>console.error(e));
