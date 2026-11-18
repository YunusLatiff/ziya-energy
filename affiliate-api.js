const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const clean=(s,max=500)=>typeof s==='string'?s.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):'';
const emailOk=s=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);
const now=()=>Math.floor(Date.now()/1000),iso=()=>new Date().toISOString();
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
export const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
export const commission=cents=>Math.round(cents*300/10000);
export const statuses=['submitted','reviewing','qualified','assessment','proposal','contracted','installation','completed','unsuccessful'];
const isAdmin=(user,env)=>Boolean(env.AFFILIATE_ADMIN_EMAIL)&&user.email.toLowerCase()===env.AFFILIATE_ADMIN_EMAIL.trim().toLowerCase();
async function body(request){
 if(!(request.headers.get('Content-Type')||'').includes('application/json'))throw new Error('Use JSON');
 const reader=request.body?.getReader();let size=0;const chunks=[];if(!reader)throw new Error('Missing body');
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>20000){await reader.cancel();throw new Error('Request too large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error('Invalid request');return data;
}
async function limit(db,bucket,max,seconds){
 const stamp=now();const row=await db.prepare('INSERT INTO affiliate_rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count').bind(bucket,stamp+seconds,stamp,stamp).first();return row.count<=max;
}
async function session(request,env){
 const cookie=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-ziya_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!cookie)return null;
 return env.AFFILIATES_DB.prepare('SELECT u.* FROM affiliate_sessions s JOIN affiliate_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0').bind(await hash(cookie),now()).first();
}
const sessionCookie=(token,age=604800)=>`__Host-ziya_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const publicFields='d.id,d.affiliate_id,d.company,d.contact_name,d.email,d.phone,d.location,d.solution,d.monthly_spend_cents,d.referral_notes,d.status,d.deal_value_cents,d.commission_rate_bps,d.commission_state,d.paid_at,d.payment_reference,d.next_action,d.follow_up_date,d.public_update,d.created_at,d.updated_at,d.version';
async function requestSignIn(request,env,data){
 const email=clean(data.email,200).toLowerCase(),first=clean(data.firstName,80),last=clean(data.lastName,80);
 if(!emailOk(email))return json({error:'Enter a valid email address.'},400);
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 if(!await limit(env.AFFILIATES_DB,'auth-ip:'+await hash(ip),12,900)||!await limit(env.AFFILIATES_DB,'auth-email:'+await hash(email),3,900))return json({error:'Too many sign-in requests. Try again in 15 minutes.'},429);
 const existing=await env.AFFILIATES_DB.prepare('SELECT id,first_name,last_name,disabled FROM affiliate_users WHERE email=?').bind(email).first();
 if(!existing&&(!first||!last))return json({error:'Enter your name and surname to create an account.'},400);
 if(existing?.disabled)return json({ok:true,message:'If this account is available, a sign-in link will arrive shortly.'});
 if(!env.RESEND_API_KEY||!env.AFFILIATE_ADMIN_EMAIL)return json({error:'Sign-in is not configured. Please contact Ziya Energy.'},503);
 const token=random(),digest=await hash(token);
 await env.AFFILIATES_DB.prepare('INSERT INTO affiliate_auth_tokens(token_hash,email,first_name,last_name,expires_at,created_at) VALUES(?,?,?,?,?,?)').bind(digest,email,existing?.first_name||first,existing?.last_name||last,now()+900,now()).run();
 const link=(env.AFFILIATE_ORIGIN||'https://ziyaenergy.co.za')+'/affiliates#verify='+token;
 let response;
 try{response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.FORM_FROM_EMAIL||'Ziya Energy <website@forms.ziyaenergy.co.za>',to:[email],subject:'Your Ziya Energy portal sign-in link',text:`Sign in to Ziya Energy: ${link}\nThis single-use link expires in 15 minutes. If you did not request it, ignore this email.`,html:`<div style="font-family:Arial;color:#151515;max-width:540px"><h1>ZIYA ENERGY</h1><h2>Your portal is ready.</h2><p>Use this single-use link to verify your email and sign in. It expires in 15 minutes.</p><p><a style="display:inline-block;background:#c5a45c;color:#111;padding:16px 24px;text-decoration:none" href="${link}">SIGN IN TO YOUR PORTAL →</a></p><p>If you did not request this email, ignore it.</p></div>`})});}catch{}
 if(!response?.ok){await env.AFFILIATES_DB.prepare('DELETE FROM affiliate_auth_tokens WHERE token_hash=?').bind(digest).run();return json({error:'We could not send your sign-in email. Try again later.'},502);}
 return json({ok:true,message:'Check your email for a secure sign-in link. It expires in 15 minutes.'});
}
async function verify(env,data){
 if(!/^[a-f0-9]{64}$/.test(data.token||''))return json({error:'Invalid sign-in link.'},400);
 const token=await env.AFFILIATES_DB.prepare('DELETE FROM affiliate_auth_tokens WHERE token_hash=? AND expires_at>? RETURNING *').bind(await hash(data.token),now()).first();
 if(!token)return json({error:'This link has expired or was already used. Request a new sign-in email.'},400);
 await env.AFFILIATES_DB.prepare('INSERT INTO affiliate_users(id,email,first_name,last_name,created_at) VALUES(?,?,?,?,?) ON CONFLICT(email) DO NOTHING').bind(crypto.randomUUID(),token.email,token.first_name,token.last_name,iso()).run();
 const user=await env.AFFILIATES_DB.prepare('SELECT * FROM affiliate_users WHERE email=?').bind(token.email).first();if(user.disabled)return json({error:'Your account is disabled. Contact Ziya Energy.'},403);
 const raw=random();await env.AFFILIATES_DB.prepare('INSERT INTO affiliate_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await hash(raw),user.id,now()+604800,now()).run();
 return json({ok:true,role:isAdmin(user,env)?'admin':'affiliate'},200,{'Set-Cookie':sessionCookie(raw)});
}
async function createDeal(user,env,data){
 const f={company:clean(data.company,160),contact:clean(data.contactName,120),email:clean(data.email,200).toLowerCase(),phone:clean(data.phone,60),location:clean(data.location,200),solution:clean(data.solution,80),notes:clean(data.notes,4000)};
 if(!f.company||!f.contact||!emailOk(f.email)||!f.phone||!f.location||!['Solar PV','Battery storage','Hybrid solar and battery','PPA / funded solar','Not sure yet'].includes(f.solution)||data.consent!==true)return json({error:'Complete the client details and confirm their permission to be contacted.'},400);
 const spend=data.monthlySpend===''||data.monthlySpend==null?null:Math.round(Number(data.monthlySpend)*100);
 if(spend!==null&&(!Number.isSafeInteger(spend)||spend<0||spend>100000000000))return json({error:'Enter a valid monthly electricity spend.'},400);
 if(!await limit(env.AFFILIATES_DB,'submit:'+user.id,30,3600))return json({error:'Referral limit reached. Try again later.'},429);
 const duplicate=await env.AFFILIATES_DB.prepare('SELECT id FROM affiliate_deals WHERE affiliate_id=? AND lower(email)=? AND lower(company)=?').bind(user.id,f.email,f.company.toLowerCase()).first();
 if(duplicate)return json({error:'You already submitted this client. Open the existing deal to follow its progress.'},409);
 const id=crypto.randomUUID(),stamp=iso();
 await env.AFFILIATES_DB.batch([
 env.AFFILIATES_DB.prepare('INSERT INTO affiliate_deals(id,affiliate_id,company,contact_name,email,phone,location,solution,monthly_spend_cents,referral_notes,consent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user.id,f.company,f.contact,f.email,f.phone,f.location,f.solution,spend,f.notes,stamp,stamp,stamp),
 env.AFFILIATES_DB.prepare('INSERT INTO affiliate_deal_events(id,deal_id,actor_id,event,public_message,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,user.id,'submitted','Client submitted. Ziya Energy will review this opportunity.',stamp)]);
 return json({ok:true,id},201);
}
async function updateDeal(user,env,id,data){
 const previous=await env.AFFILIATES_DB.prepare('SELECT * FROM affiliate_deals WHERE id=?').bind(id).first();if(!previous)return json({error:'Deal not found.'},404);
 const status=data.status,raw=Number(data.dealValue),value=Math.round(raw*100);
 if(!statuses.includes(status)||data.dealValue===''||!Number.isFinite(raw)||raw<0||!Number.isSafeInteger(value)||value>100000000000||!Number.isInteger(data.version))return json({error:'Choose a valid stage, deal value and record version.'},400);
 if(status==='completed'&&value<=0)return json({error:'Enter the final deal value before completing the deal.'},400);
 const state=status==='completed'?(data.commissionState==='paid'?'paid':'earned'):'pending',reference=clean(data.paymentReference,120);
 if(state==='paid'&&!reference)return json({error:'Add a payment reference before marking commission paid.'},400);
 if(previous.commission_state==='paid'&&(value!==previous.deal_value_cents||status!=='completed'||state!=='paid'))return json({error:'Paid deals are locked to protect the commission record.'},409);
 const follow=clean(data.followUpDate,10);if(follow&&!/^\d{4}-\d{2}-\d{2}$/.test(follow))return json({error:'Invalid follow-up date.'},400);
 const stamp=iso(),update=clean(data.publicUpdate,3000),detail=JSON.stringify({from:previous.status,to:status,previousValue:previous.deal_value_cents,value,commission:state});
 const result=await env.AFFILIATES_DB.batch([
 env.AFFILIATES_DB.prepare('INSERT INTO affiliate_deal_events(id,deal_id,actor_id,event,public_message,private_detail,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM affiliate_deals WHERE id=? AND version=?)').bind(crypto.randomUUID(),id,user.id,'updated',update||'Progress updated by Ziya Energy.',detail,stamp,id,data.version),
 env.AFFILIATES_DB.prepare('UPDATE affiliate_deals SET status=?,deal_value_cents=?,commission_state=?,paid_at=?,payment_reference=?,next_action=?,follow_up_date=?,public_update=?,private_notes=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(status,value,state,state==='paid'?(previous.paid_at||stamp):null,reference,clean(data.nextAction,500),follow,update,clean(data.privateNotes,6000),stamp,id,data.version)]);
 if(result[1].meta.changes!==1)return json({error:'This deal changed in another session. Refresh before saving.'},409);return json({ok:true});
}
export async function affiliateApi(request,env){
 const url=new URL(request.url),route=url.pathname.replace('/api/affiliates','');
 if(!env.AFFILIATES_DB)return json({error:'The affiliate portal is being configured. Try again shortly.'},503);
 if(!['GET','POST','PATCH'].includes(request.method))return json({error:'Method not allowed.'},405);
 if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return json({error:'Please use the Ziya Energy portal.'},403);
 try{
 if(request.method==='POST'&&route==='/auth/request')return await requestSignIn(request,env,await body(request));
 if(request.method==='POST'&&route==='/auth/verify')return await verify(env,await body(request));
 const user=await session(request,env);if(!user)return json({error:'Please sign in to continue.'},401);const admin=isAdmin(user,env);
 if(route==='/me'&&request.method==='GET')return json({user:{id:user.id,firstName:user.first_name,lastName:user.last_name,email:user.email},role:admin?'admin':'affiliate',commissionRate:3});
 if(route==='/logout'&&request.method==='POST'){
 const raw=(request.headers.get('Cookie')||'').match(/__Host-ziya_session=([a-f0-9]{64})/)?.[1];if(raw)await env.AFFILIATES_DB.prepare('DELETE FROM affiliate_sessions WHERE token_hash=?').bind(await hash(raw)).run();return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});}
 if(route==='/deals'&&request.method==='POST')return await createDeal(user,env,await body(request));
 if(route==='/deals'&&request.method==='GET'){
 const page=Number(url.searchParams.get('page')||0);if(!Number.isInteger(page)||page<0||page>1000000)return json({error:'Invalid page.'},400);
 const rows=await env.AFFILIATES_DB.prepare('SELECT '+publicFields+(admin?',d.private_notes,u.first_name AS affiliate_first_name,u.last_name AS affiliate_last_name,u.email AS affiliate_email':'')+' FROM affiliate_deals d'+(admin?' JOIN affiliate_users u ON u.id=d.affiliate_id':' WHERE d.affiliate_id=?')+' ORDER BY d.created_at DESC,d.id DESC LIMIT 200 OFFSET ?').bind(...(admin?[]:[user.id]),page*200).all();return json({deals:rows.results.map(row=>({...row,commission_cents:commission(row.deal_value_cents)})),nextPage:rows.results.length===200?page+1:null});}
 const match=route.match(/^\/deals\/([0-9a-f-]{36})(\/events)?$/);
 if(match){const id=match[1];
 if(request.method==='PATCH'&&!match[2]){if(!admin)return json({error:'Only Ziya Energy can update deal progress and commissions.'},403);return await updateDeal(user,env,id,await body(request));}
 if(request.method==='GET'&&match[2]){
 const owned=await env.AFFILIATES_DB.prepare('SELECT id FROM affiliate_deals WHERE id=?'+(admin?'':' AND affiliate_id=?')).bind(id,...(admin?[]:[user.id])).first();if(!owned)return json({error:'Deal not found.'},404);
 const events=await env.AFFILIATES_DB.prepare('SELECT id,event,public_message,created_at'+(admin?',private_detail':'')+' FROM affiliate_deal_events WHERE deal_id=? ORDER BY created_at DESC LIMIT 100').bind(id).all();return json({events:events.results});}}
 if(route==='/users'&&request.method==='GET'){
 if(!admin)return json({error:'Admin access required.'},403);
 const users=await env.AFFILIATES_DB.prepare('SELECT u.id,u.first_name,u.last_name,u.email,u.created_at,u.disabled,COUNT(d.id) AS deal_count,COALESCE(SUM(d.deal_value_cents),0) AS pipeline_cents FROM affiliate_users u LEFT JOIN affiliate_deals d ON d.affiliate_id=u.id GROUP BY u.id ORDER BY u.created_at DESC').all();return json({users:users.results});}
 return json({error:'Not found.'},404);
 }catch(error){if(error instanceof SyntaxError||['Use JSON','Missing body','Invalid request','Request too large'].includes(error?.message))return json({error:'Invalid request data.'},400);console.error('affiliate_request_failed',{route,error:error?.message?.slice(0,100)});return json({error:'The request could not be completed. Try again.'},500);}
}
