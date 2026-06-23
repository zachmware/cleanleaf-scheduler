const srs = Array.from({length: 150}, (_, i) => '3' + String(i).padStart(5, '0')); 
const srStr = srs.map(w => '"' + w + '"').join(','); 
const whereClause = encodeURIComponent('status="NEWWO" and origrecordid in [' + srStr + ']'); 
const selectParams = 'wonum,status,description,worktype,origrecordid,jobtype_description,wopriority,statusdate,client,vendor,location,estdur,woserviceaddress{description,streetaddress,city,stateprovince,postalcode},locations{region}'; 
const osUrl = 'https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=' + whereClause + '&oslc.select=' + encodeURIComponent(selectParams) + '&oslc.pageSize=500'; 
console.log('URL Length:', osUrl.length);
