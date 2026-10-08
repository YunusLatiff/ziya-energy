/* Run against local preview: npm install --no-save playwright; npx playwright install chromium; node tests/browser.test.cjs */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const base=process.env.PREVIEW_URL||'http://127.0.0.1:8787';
 const screenshots=process.env.SCREENSHOT_DIR;
 if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
 const pages=['/','/contact','/about','/solutions','/commercial-solar','/battery-storage','/hybrid-energy','/power-purchase-agreements','/assessment-guide','/privacy','/industries','/approach','/missing-page'];
 const errors=[];
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  for(const slug of pages){
   await p.goto(base+slug,{waitUntil:'domcontentloaded'});
   await p.locator('h1').waitFor();
   assert.equal(await p.locator('h1').count(),1);
   const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   if(overflow){const els=await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.tagName+'.'+e.className));throw new Error(`${width} ${slug} overflow: ${els.slice(0,10)}`);}
   if(screenshots && ['/','/contact','/about','/commercial-solar'].includes(slug))await p.screenshot({path:screenshots+'/'+(slug==='/'?'home':slug.slice(1))+'-'+width+'.png',fullPage:false});
  }
  if(width===390){
   await p.goto(base+'/');await p.getByRole('button',{name:'Open menu'}).click();
   assert.equal(await p.getByRole('button',{name:'Close menu'}).getAttribute('aria-expanded'),'true');
   await p.keyboard.press('Escape');assert.equal(await p.getByRole('button',{name:'Open menu'}).getAttribute('aria-expanded'),'false');
  }
  await context.close();console.log(`Layout checks passed at ${width}px across ${pages.length} pages`);
 }
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const p=await context.newPage();
 await p.goto(base+'/');await p.locator('#est-bill').fill('100000');await p.locator('#est-goal').selectOption('95');
 await p.getByRole('button',{name:'EXPLORE MY OPTIONS'}).click();
 assert.equal(await p.locator('#est-grid').textContent(),'Requires site modelling');
 assert.match(await p.locator('#est-direction').textContent(),/Target 95%/);
 await p.locator('#est-followup').click();
 assert.equal(await p.locator('[name="Monthly spend"]').inputValue(),'100000');
 assert.equal(await p.locator('[name="Objective"]').inputValue(),'Target 95% less grid energy');
 await p.getByText('Online enquiries are temporarily unavailable.',{exact:false}).waitFor();
 assert.equal(await p.locator('button[type="submit"]').isDisabled(),true);
 console.log('Calculator handoff and unconfigured contact fallback passed');
 await context.close();
 // Local service fixtures only: no real challenge or email calls.
 const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/config',r=>r.fulfill({json:{contactReady:true,turnstileSiteKey:'local-fixture',eventLogging:true}}));
 await page.route('https://challenges.cloudflare.com/**',r=>r.fulfill({contentType:'text/javascript',body:'window.turnstile={render:(selector,options)=>{window.fixtureCallback=options.callback;setTimeout(options.callback,0);return 1;},getResponse:()=>"local-fixture-token",reset:()=>setTimeout(window.fixtureCallback,0)};'}));
 let submissions=0;
 await page.route('**/api/contact',async r=>{submissions++;const b=r.request().postDataJSON();assert.equal(b.Name,'Test Person');assert.equal(b.OperatingDays,'Monday – Saturday');assert.equal(b.OperatingHours,'08:00 – 17:00');
 if(submissions===1)await r.fulfill({status:502,json:{ok:false,error:'Test delivery error'}});else await r.fulfill({json:{ok:true,reference:'test-reference'}});
 });
 const events=[];await page.route('**/api/event',r=>{events.push(JSON.parse(r.request().postData()).event);r.fulfill({status:204});});
 await page.goto(base+'/contact');await page.getByRole('button',{name:'ALLOW MEASUREMENT'}).click();
 await page.locator('[name="Name"]').fill('Test Person');await page.locator('[name="Company"]').fill('Example Company');await page.locator('[name="Email"]').fill('person@example.com');
 await page.locator('#technical-details > summary').click();await page.locator('[name="OperatingDays"]').selectOption({label:'Monday – Saturday'});await page.locator('[name="OperatingHours"]').selectOption({label:'08:00 – 17:00'});
 await page.getByRole('button',{name:'SEND MY ENQUIRY'}).click();await page.getByText('Test delivery error').waitFor();assert.equal(await page.locator('[name="Name"]').inputValue(),'Test Person');
 await page.getByRole('button',{name:'RETRY ENQUIRY'}).click();await page.getByText('ENQUIRY RECEIVED',{exact:true}).waitFor();assert.equal(await page.locator('.reference').textContent(),'Reference: test-reference');
 await page.waitForTimeout(2200);assert.match(page.url(),/\/contact$/);assert.equal(events.filter(e=>e==='generate_lead').length,1);
 if(screenshots)await page.screenshot({path:screenshots+'/success-mobile.png',fullPage:true});
 console.log('Mocked email-error recovery, retained values, success confirmation and conversion tracking passed');
 assert.deepEqual(errors,[]);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
