require('dotenv').config({path: '.env.local'});
const auth = Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64');
fetch('https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=wonum="109202"&oslc.select=*&oslc.pageSize=1', {headers:{maxauth: auth}})
  .then(r=>r.json())
  .then(j => console.log(JSON.stringify(j.member || j['rdfs:member'], null, 2)))
  .catch(e=>console.error(e));
