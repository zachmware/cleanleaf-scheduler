require('dotenv').config({path: '.env.local'});
const auth = Buffer.from(process.env.MAXIMO_USER + ':' + process.env.MAXIMO_PASS).toString('base64');
const headers = { 'Content-Type': 'application/json', 'maxauth': auth, 'x-public-uri': 'https://cleanleafmax.softwrench2.com/maximo/oslc' };

async function run() {
  // 1. Check how many STAGE6 SRs exist
  const srRes = await fetch('https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=status="STAGE6"&oslc.select=ticketid,status&oslc.pageSize=2000', { headers });
  const srData = await srRes.json();
  const srs = srData['rdfs:member'] || [];
  console.log('STAGE6 SRs:', srs.length);

  // 2. Check woadditionalresource with status=None
  const arRes = await fetch('https://cleanleafmax.softwrench2.com/maxrest/rest/mbo/woadditionalresource?_format=json&_maxItems=2000&_inclCol=personid,schedstart,schedfinish,status,wonum&_orderby=WOADDITIONALRESOURCEID%20desc', { headers });
  const arData = await arRes.json();
  const allAR = arData.WOADDITIONALRESOURCEMboSet?.WOADDITIONALRESOURCE || [];
  const rtsAR = allAR.filter(a => a.Attributes?.STATUS?.content === 'None');
  console.log('Total AR records:', allAR.length, '| RTS (status=None):', rtsAR.length);

  // 3. Sample WOs to see worktype and jobtype_description values
  const rtsWonums = [...new Set(rtsAR.map(a => a.Attributes?.WONUM?.content).filter(Boolean))].slice(0, 50);
  const wonumStr = rtsWonums.map(w => `"${w}"`).join(',');
  const selectParams = 'wonum,status,description,worktype,origrecordid,jobtype_description,wopriority,statusdate,location,estdur';
  const woRes = await fetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=${encodeURIComponent(`wonum in [${wonumStr}]`)}&oslc.select=${encodeURIComponent(selectParams)}&oslc.pageSize=500`, { headers });
  const woData = await woRes.json();
  const wos = woData['rdfs:member'] || [];
  
  // Count worktypes and jobtype_descriptions
  const worktypes = {};
  const jobtypes = {};
  const statuses = {};
  wos.forEach(wo => {
    const wt = wo['spi:worktype'] || 'null';
    const jt = wo['spi:jobtype_description'] || 'null';
    const st = wo['spi:status'] || 'null';
    worktypes[wt] = (worktypes[wt] || 0) + 1;
    jobtypes[jt] = (jobtypes[jt] || 0) + 1;
    statuses[st] = (statuses[st] || 0) + 1;
  });
  
  console.log('\nSample RTS WOs (first 50 AR wonums):');
  console.log('  WO Statuses:', statuses);
  console.log('  Work Types:', worktypes);
  console.log('  Job Type Descriptions:', jobtypes);
  
  // 4. Show some sample records with their jobtype
  console.log('\nSample WOs:');
  wos.slice(0, 10).forEach(wo => {
    console.log(`  WO ${wo['spi:wonum']}: status="${wo['spi:status']}" worktype="${wo['spi:worktype']}" jobtype="${wo['spi:jobtype_description']}" desc="${(wo['spi:description']||'').substring(0, 60)}"`);
  });
  
  // 5. Check: are there NEWWO WOs NOT linked to STAGE6 SRs?
  // Get all NEWWO work orders directly
  const newwoRes = await fetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapiwodetail?oslc.where=status="NEWWO"&oslc.select=wonum,origrecordid,worktype,jobtype_description&oslc.pageSize=2000`, { headers });
  const newwoData = await newwoRes.json();
  const allNewwo = newwoData['rdfs:member'] || [];
  console.log('\nTotal NEWWO WOs in system:', allNewwo.length);
  
  // How many of those have origrecordid matching a STAGE6 SR?
  const stage6Ids = new Set(srs.map(sr => sr['spi:ticketid']));
  const inStage6 = allNewwo.filter(wo => stage6Ids.has(wo['spi:origrecordid']));
  const notInStage6 = allNewwo.filter(wo => !stage6Ids.has(wo['spi:origrecordid']));
  console.log('  Linked to STAGE6 SR:', inStage6.length);
  console.log('  NOT linked to STAGE6 SR:', notInStage6.length);
  
  // Check origrecordid status for those not in STAGE6
  if (notInStage6.length > 0) {
    const missingOrigs = [...new Set(notInStage6.map(wo => wo['spi:origrecordid']).filter(Boolean))].slice(0, 30);
    if (missingOrigs.length > 0) {
      const origStr = missingOrigs.map(s => `"${s}"`).join(',');
      const origRes = await fetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=${encodeURIComponent(`ticketid in [${origStr}]`)}&oslc.select=ticketid,status&oslc.pageSize=500`, { headers });
      const origData = await origRes.json();
      const origSrs = origData['rdfs:member'] || [];
      const origStatuses = {};
      origSrs.forEach(sr => { origStatuses[sr['spi:status']] = (origStatuses[sr['spi:status']] || 0) + 1; });
      console.log('  SR statuses for non-STAGE6 NEWWO WOs:', origStatuses);
    }
    
    // Count worktypes for missing WOs
    const missingWorktypes = {};
    notInStage6.forEach(wo => {
      const wt = wo['spi:worktype'] || 'null';
      missingWorktypes[wt] = (missingWorktypes[wt] || 0) + 1;
    });
    console.log('  Work types for non-STAGE6 NEWWO WOs:', missingWorktypes);
    
    // No origrecordid at all?
    const noOrig = notInStage6.filter(wo => !wo['spi:origrecordid']);
    console.log('  NEWWO WOs with NO origrecordid:', noOrig.length);
  }
  
  // 6. Also check what the actual case type field should be
  // Look at SR fields
  const sampleSrs = srs.slice(0, 5).map(sr => sr['spi:ticketid']);
  const sampleSrStr = sampleSrs.map(s => `"${s}"`).join(',');
  const srDetailRes = await fetch(`https://cleanleafmax.softwrench2.com/maximo/oslc/os/mxapisr?oslc.where=${encodeURIComponent(`ticketid in [${sampleSrStr}]`)}&oslc.select=ticketid,status,description,reportedpriority,ticketuid,customworktype,internalpriority&oslc.pageSize=10`, { headers });
  const srDetailData = await srDetailRes.json();
  const srDetails = srDetailData['rdfs:member'] || [];
  console.log('\nSample SR details:');
  srDetails.forEach(sr => {
    console.log(`  SR ${sr['spi:ticketid']}: customworktype="${sr['spi:customworktype']}" internalpriority="${sr['spi:internalpriority']}" desc="${(sr['spi:description']||'').substring(0, 50)}"`);
  });
}

run().catch(e => console.error(e));
