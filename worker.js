import { affiliateApi } from './affiliate-api.js';
const JSON_HEADERS = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const clean=(value,max=500)=>typeof value==='string'?value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max):'';
const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const configured=env=>Boolean(env.RESEND_API_KEY && env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY && !env.TURNSTILE_SITE_KEY.startsWith('SET_'));
const allowedEvents=new Set(['assessment_cta_click','whatsapp_click','phone_click','email_click','quick_estimator_completed','generate_lead','affiliate_cta_click']);
async function readBody(request,max=16384){
  if(Number(request.headers.get('Content-Length'))>max)throw new Error('TOO_LARGE');
  const reader=request.body?.getReader();if(!reader)throw new Error('BAD_BODY');
  const chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error('TOO_LARGE');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const body=JSON.parse(new TextDecoder().decode(bytes));
  if(!body || typeof body!=='object' || Array.isArray(body))throw new Error('BAD_BODY');return body;
}
const fields=[['Name','name',120],['Company','company',160],['Email','email',200],['Phone','phone',80],['Location','location',200],['Industry','industry',160],['Consumption','consumption',120],['Monthly spend','monthlySpend',120],['OperatingDays','operatingDays',160],['OperatingHours','operatingHours',160],['Solar','solar',80],['Battery','battery',80],['Objective','objective',180],['Message','message',3000]];
async function sendEmail(env,f,reference){
  const rows=fields.filter(([,key])=>f[key]).map(([label,key])=>`<tr><th style="text-align:left;padding:12px;border-bottom:1px solid #ddd">${escapeHtml(label)}</th><td style="padding:12px;border-bottom:1px solid #ddd">${escapeHtml(f[key])}</td></tr>`).join('');
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',signal:AbortSignal.timeout(12000),
    headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`ziya-enquiry-${reference}`},
    body:JSON.stringify({from:env.FORM_FROM_EMAIL||'Ziya Energy Website <website@forms.ziyaenergy.co.za>',to:[env.FORM_TO_EMAIL||'yunus@ziyaenergy.co.za'],reply_to:f.email,
      subject:`Ziya Energy enquiry — ${f.company.replace(/[\r\n]/g,' ')}`,
      html:`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17181b"><h1>Ziya Energy — new enquiry</h1><p>Reference: ${escapeHtml(reference)}</p><table style="border-collapse:collapse">${rows}</table></body></html>`,
      text:`Ziya Energy enquiry\nReference: ${reference}\n`+fields.filter(([,key])=>f[key]).map(([label,key])=>`${label}: ${f[key]}`).join('\n')})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok || !result.id)throw new Error('EMAIL_FAILED');
  return result.id;
}
async function contact(request,env,url){
  if(request.method!=='POST')return json({ok:false,error:'Method not allowed.'},405);
  const origin=request.headers.get('Origin');
  if(origin && origin!==url.origin)return json({ok:false,error:'Please submit from this website.'},403);
  if(!configured(env))return json({ok:false,error:'Online enquiries are temporarily unavailable. Please email yunus@ziyaenergy.co.za.'},503);
  if(!(request.headers.get('Content-Type')||'').toLowerCase().includes('application/json'))return json({ok:false,error:'Please use the website enquiry form.'},415);
  let body;try{body=await readBody(request);}catch(e){return json({ok:false,error:'Invalid form data.'},e.message==='TOO_LARGE'?413:400);}
  if(clean(body.website,100))return json({ok:true});
  const f=Object.fromEntries(fields.map(([label,key,max])=>[key,clean(body[label]??body[key],max)]));
  if(!f.name || !f.company || !f.email)return json({ok:false,error:'Please complete your name, company and email address.'},400);
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(f.email))return json({ok:false,error:'Please enter a valid email address.'},400);
  for(const key of ['consumption','monthlySpend'])if(f[key] && (!Number.isFinite(Number(f[key])) || Number(f[key])<=0))return json({ok:false,error:'Electricity usage and spend must be positive numbers when provided.'},400);
  const token=clean(body.turnstileToken,2048);
  if(!token)return json({ok:false,error:'Please complete the security check.'},400);
  let verification;
  try{
    const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),body:JSON.stringify({secret:env.TURNSTILE_SECRET,response:token,remoteip:request.headers.get('CF-Connecting-IP')||undefined})});
    if(!response.ok)throw new Error();verification=await response.json();
  }catch{return json({ok:false,error:'The security service is temporarily unavailable. Please retry or contact us directly.'},503);}
  const hostnames=(env.ALLOWED_HOSTNAMES||'ziyaenergy.co.za,www.ziyaenergy.co.za').split(',').map(s=>s.trim());
  if(!verification.success || verification.action!=='contact' || !hostnames.includes(verification.hostname))return json({ok:false,error:'Security verification failed. Please refresh the check and retry.'},403);
  const reference=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.submissionId||'')?body.submissionId:crypto.randomUUID();
  // Optional durable inbox. A failed database write never silently drops a lead.
  if(env.LEADS_DB){
    try{
      const existing=await env.LEADS_DB.prepare('SELECT payload, status FROM enquiries WHERE id = ?').bind(reference).first();
      if(existing){
        if(existing.payload!==JSON.stringify(f))return json({ok:false,error:'This enquiry changed during a retry. Please refresh and submit again.'},409);
        if(existing.status==='sent')return json({ok:true,reference});
      }else await env.LEADS_DB.prepare('INSERT INTO enquiries (id, created_at, payload, status) VALUES (?, ?, ?, ?)').bind(reference,new Date().toISOString(),JSON.stringify(f),'pending').run();
    }catch{return json({ok:false,error:'Your enquiry could not be saved. Please retry or contact us directly.'},503);}
  }
  try{
    const emailId=await sendEmail(env,f,reference);
    if(env.LEADS_DB){
      try{await env.LEADS_DB.prepare('UPDATE enquiries SET status = ?, email_id = ? WHERE id = ?').bind('sent',emailId,reference).run();}
      catch{console.error('lead_status_update_failed',{reference});}
    }
    return json({ok:true,reference});
  }catch{
    if(env.LEADS_DB){try{await env.LEADS_DB.prepare('UPDATE enquiries SET status = ? WHERE id = ?').bind('email_failed',reference).run();}catch{console.error('lead_status_update_failed',{reference});}}
    console.error('enquiry_email_failed',{reference});
    return json({ok:false,error:'Email delivery could not be confirmed. Your details remain in the form; please retry or contact us directly.'},502);
  }
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/affiliates/'))return affiliateApi(request,env);
    if(url.pathname==='/api/config' && request.method==='GET')return json({contactReady:configured(env),turnstileSiteKey:configured(env)?env.TURNSTILE_SITE_KEY:'',analyticsToken:env.WEB_ANALYTICS_TOKEN||'',gaMeasurementId:env.GA_MEASUREMENT_ID||'',eventLogging:env.ENABLE_EVENT_LOGGING==='true'});
    if(url.pathname==='/api/contact')return contact(request,env,url);
    if(url.pathname==='/api/event' && request.method==='POST'){
      const origin=request.headers.get('Origin');if(origin && origin!==url.origin)return new Response(null,{status:403});
      if(env.ENABLE_EVENT_LOGGING==='true')try{const event=await readBody(request,1024);if(allowedEvents.has(event.event))console.log('site_event',{event:event.event,path:clean(event.path,100).split('?')[0]});}catch{}
      return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname.startsWith('/api/'))return json({ok:false,error:'Not found.'},404);
    return env.ASSETS.fetch(request);
  }
};
