import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
const env={RESEND_API_KEY:'test-key',TURNSTILE_SECRET:'test-secret',TURNSTILE_SITE_KEY:'test-public',ASSETS:{fetch:()=>new Response('asset')}};
const valid={Name:'Test Person',Company:'Example <Company>',Email:'person@example.com','Monthly spend':'100000',OperatingDays:'Monday – Friday',OperatingHours:'08:00 – 17:00',turnstileToken:'test-token',submissionId:'12345678-1234-4123-8123-123456789012'};
const request=(body,extra={})=>new Request('https://ziyaenergy.co.za/api/contact',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://ziyaenergy.co.za',...extra},body:JSON.stringify(body)});
const result=async(body,settings=env)=>worker.fetch(request(body),settings);
const verification={success:true,hostname:'ziyaenergy.co.za',action:'contact'};
test('configuration exposes only public settings and correctly reports unavailable forms',async()=>{
 const r=await worker.fetch(new Request('https://ziyaenergy.co.za/api/config'),env);const j=await r.json();assert.equal(j.contactReady,true);assert.ok(!JSON.stringify(j).includes('test-secret'));assert.ok(!JSON.stringify(j).includes('test-key'));
 const no=await worker.fetch(new Request('https://ziyaenergy.co.za/api/config'),{TURNSTILE_SITE_KEY:'SET_THIS_IN_CLOUDFLARE'});assert.equal((await no.json()).contactReady,false);
});
test('unconfigured contact returns 503',async()=>assert.equal((await result(valid,{})).status,503));
test('rejects invalid, null and oversized payloads before external calls',async()=>{
 assert.equal((await result(null)).status,400);assert.equal((await result([])).status,400);
 assert.equal((await result({...valid,Name:''})).status,400);
 assert.equal((await result({...valid,Email:'bad@'})).status,400);
 assert.equal((await result({...valid,'Monthly spend':'-5'})).status,400);
 assert.equal((await result({...valid,turnstileToken:''})).status,400);
 assert.equal((await result({...valid,Message:'a'.repeat(17000)})).status,413);
 assert.equal((await worker.fetch(request(valid,{Origin:'https://elsewhere.example'}),env)).status,403);
});
test('honeypot does not invoke external services',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Unexpected fetch');};
 try{assert.equal((await result({...valid,website:'bot'})).status,200);}finally{globalThis.fetch=old;}
});
test('valid enquiry includes separate days/hours, escaped content and idempotency key',async()=>{
 const old=globalThis.fetch;let email;
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('siteverify'))return Response.json(verification);
  email={headers:options.headers,payload:JSON.parse(options.body)};return Response.json({id:'mail-123'});
 };
 try{const r=await result(valid);assert.equal(r.status,200);assert.equal((await r.json()).reference,valid.submissionId);
 assert.match(email.payload.html,/Example &lt;Company&gt;/);assert.match(email.payload.text,/Monday – Friday/);assert.match(email.payload.text,/08:00 – 17:00/);
 assert.equal(email.headers['Idempotency-Key'],'ziya-enquiry-'+valid.submissionId);assert.equal(email.payload.reply_to,valid.Email);
 }finally{globalThis.fetch=old;}
});
test('rejects invalid challenge, hostname and action',async()=>{
 const old=globalThis.fetch;
 try{for(const v of [{...verification,success:false},{...verification,hostname:'attacker.example'},{...verification,action:'other'}]){globalThis.fetch=async()=>Response.json(v);assert.equal((await result(valid)).status,403);}}
 finally{globalThis.fetch=old;}
});
test('challenge outage and email rejection are explicit errors, never false success',async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=async()=>{throw new Error('offline');};assert.equal((await result(valid)).status,503);
 globalThis.fetch=async url=>String(url).includes('siteverify')?Response.json(verification):Response.json({error:'no'},{status:500});assert.equal((await result(valid)).status,502);
 }finally{globalThis.fetch=old;}
});
function mockDB(existing=null,failInsert=false){const calls=[];return {calls,prepare(sql){return {bind(...args){return {first:async()=>existing,run:async()=>{if(failInsert && sql.startsWith('INSERT'))throw new Error('DB unavailable');calls.push({sql,args});return {};}};}};}};}
test('optional durable inbox records success and email failure',async()=>{
 const old=globalThis.fetch;
 try{for(const success of [true,false]){const db=mockDB();globalThis.fetch=async url=>String(url).includes('siteverify')?Response.json(verification):Response.json(success?{id:'mail'}:{error:'fail'},{status:success?200:500});
 const r=await result(valid,{...env,LEADS_DB:db});assert.equal(r.status,success?200:502);assert.equal(db.calls[0].args[3],'pending');assert.equal(db.calls[1].args[0],success?'sent':'email_failed');}}
 finally{globalThis.fetch=old;}
});
test('database failure does not proceed to email or claim success',async()=>{
 const old=globalThis.fetch;let sent=false;
 globalThis.fetch=async url=>{if(String(url).includes('siteverify'))return Response.json(verification);sent=true;return Response.json({id:'mail'});};
 try{assert.equal((await result(valid,{...env,LEADS_DB:mockDB(null,true)})).status,503);assert.equal(sent,false);}finally{globalThis.fetch=old;}
});
test('analytics discards arbitrary properties and rejects unknown event names',async()=>{
 const old=console.log;const logs=[];console.log=(...args)=>logs.push(args);
 try{for(const name of ['generate_lead','not_allowed'])await worker.fetch(new Request('https://ziyaenergy.co.za/api/event',{method:'POST',body:JSON.stringify({event:name,path:'/contact',properties:{email:'private@example.com'}})}),{ENABLE_EVENT_LOGGING:'true'});
 assert.equal(logs.length,1);assert.deepEqual(logs[0][1],{event:'generate_lead',path:'/contact'});}finally{console.log=old;}
});
test('unknown APIs are JSON 404; assets are delegated',async()=>{
 assert.equal((await worker.fetch(new Request('https://ziyaenergy.co.za/api/missing'),env)).status,404);
 assert.equal(await(await worker.fetch(new Request('https://ziyaenergy.co.za/'),env)).text(),'asset');
});
