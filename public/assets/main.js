/* Ziya Energy v7: progressive enhancement; no enquiry data in analytics. */
const menu = document.querySelector('.menu');
const nav = document.querySelector('.nav');
function closeMenu() {
  nav?.classList.remove('open');
  menu?.setAttribute('aria-expanded', 'false');
  menu?.setAttribute('aria-label', 'Open menu');
}
menu?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});
nav?.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav?.classList.contains('open')) { closeMenu(); menu.focus(); } });

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Content is visible without JavaScript, even when enhancement cannot load.
if ('IntersectionObserver' in window && !reducedMotion) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('show'); observer.unobserve(entry.target); }
  }), {threshold: 0.05});
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

const configPromise = fetch('/api/config', {headers: {Accept: 'application/json'}})
  .then(r => { if (!r.ok) throw new Error(); return r.json(); }).catch(() => ({}));
const storage = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(key, value); } catch {} },
  remove(key) { try { sessionStorage.removeItem(key); } catch {} }
};
let measurementAllowed = false;
try { measurementAllowed = localStorage.getItem('ziya-measurement') === 'allow'; } catch {}
function trackEvent(event) {
  if (!measurementAllowed) return;
  try { navigator.sendBeacon?.('/api/event', JSON.stringify({event, path: location.pathname})); } catch {}
  if (typeof window.gtag === 'function') window.gtag('event', event);
}
function startMeasurement(config) {
  if (!measurementAllowed || window.ziyaMeasurementStarted) return;
  window.ziyaMeasurementStarted = true;
  if (/^[a-f0-9]{32}$/i.test(config.analyticsToken || '')) {
    const script = document.createElement('script');
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.defer = true; script.dataset.cfBeacon = JSON.stringify({token: config.analyticsToken});
    document.head.append(script);
  }
  if (/^G-[A-Z0-9]+$/.test(config.gaMeasurementId || '')) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', config.gaMeasurementId, {send_page_view: true, allow_google_signals: false, allow_ad_personalization_signals: false});
    const script = document.createElement('script');script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + config.gaMeasurementId;
    document.head.append(script);
  }
}
const panel = document.getElementById('consent-panel');
configPromise.then(config => {
  let choice; try { choice = localStorage.getItem('ziya-measurement'); } catch {}
  if (panel && !choice && (config.analyticsToken || config.gaMeasurementId || config.eventLogging)) panel.hidden = false;
  startMeasurement(config);
});
function chooseMeasurement(allow) {
  const wasStarted = window.ziyaMeasurementStarted;
  measurementAllowed = allow;
  try { localStorage.setItem('ziya-measurement', allow ? 'allow' : 'deny'); } catch {}
  panel.hidden = true;
  if (!allow && wasStarted) {
    // Remove optional Analytics cookies we can access, then stop loaded trackers.
    for (const cookie of document.cookie.split(';')) {
      const key = cookie.split('=')[0].trim();
      if (/^_ga(?:_|$)|^_gid$|^_gat/.test(key)) {
        for (const domain of ['', location.hostname, '.' + location.hostname])
          document.cookie = key + '=; Max-Age=0; path=/;' + (domain ? ' domain=' + domain + ';' : '');
      }
    }
    location.reload();
  } else if (allow) configPromise.then(startMeasurement);
}
document.getElementById('consent-accept')?.addEventListener('click', () => chooseMeasurement(true));
document.getElementById('consent-decline')?.addEventListener('click', () => chooseMeasurement(false));
document.querySelectorAll('.privacy-choice').forEach(el => el.addEventListener('click', () => {
  panel.hidden = false; document.getElementById('consent-decline').focus();
}));
document.querySelectorAll('a[href="/contact"]').forEach(a => a.addEventListener('click', () => trackEvent('assessment_cta_click')));
document.querySelectorAll('a[href*="wa.me/"]').forEach(a => a.addEventListener('click', () => trackEvent('whatsapp_click')));
document.querySelectorAll('a[href^="tel:"]').forEach(a => a.addEventListener('click', () => trackEvent('phone_click')));
document.querySelectorAll('a[href^="mailto:"]').forEach(a => a.addEventListener('click', () => trackEvent('email_click')));

/* Starting-point guide: no fabricated savings, sizes or performance forecasts. */
const estimator = document.getElementById('quick-estimator');
estimator?.addEventListener('submit', e => {
  e.preventDefault(); if (!estimator.reportValidity()) return;
  const bill = Number(document.getElementById('est-bill').value);
  if (!Number.isFinite(bill) || bill <= 0) return;
  const profile = document.getElementById('est-profile').value;
  const goal = document.getElementById('est-goal').value;
  const goals = {cost: 'Reduce electricity costs', '80': 'Target 80% less grid energy', '95': 'Target 95% less grid energy', resilience: 'Backup / resilience'};
  const systems = goal === 'resilience' ? 'Battery or hybrid system' : ['80','95'].includes(goal) || profile !== 'day' ? 'Solar + storage comparison' : 'Solar PV assessment';
  document.getElementById('est-direction').textContent = goals[goal];
  document.getElementById('est-system').textContent = systems;
  document.getElementById('est-grid').textContent = 'Requires site modelling';
  document.getElementById('est-priority').textContent = goal === 'resilience' ? 'Critical loads + backup duration' : 'Tariff + interval consumption';
  document.getElementById('est-note').textContent = 'Your monthly bill of ' + new Intl.NumberFormat('en-ZA', {style:'currency',currency:'ZAR',maximumFractionDigits:2}).format(bill) + ' provides budget context, not a system size. Any percentage above is your target for reduced grid energy (kWh), not a prediction or a bill-saving estimate. We need site, tariff and time-based consumption data to test feasibility, including each month if required.';
  storage.set('ziya-starting-point', JSON.stringify({bill, profile, goal, at:Date.now()}));
  const result = document.getElementById('estimator-result');result.hidden = false;result.focus({preventScroll:true});
  result.scrollIntoView({behavior:reducedMotion ? 'auto':'smooth',block:'nearest'});
  trackEvent('quick_estimator_completed');
});

/* Enquiry form: preserve input on errors; explicit confirmation; retry safely. */
(async () => {
  const form = document.getElementById('energy-assessment-form'); if (!form) return;
  form.addEventListener('submit', e => e.preventDefault());
  const status = document.getElementById('form-status');
  const submit = form.querySelector('button[type="submit"]');
  const setStatus = (message, type='') => {status.textContent = message;status.className = 'form-status ' + type;};
  try {
    const saved = JSON.parse(storage.get('ziya-starting-point') || 'null');
    if (saved && Date.now()-saved.at < 3600000 && saved.bill > 0) {
      form.elements['Monthly spend'].value = saved.bill;
      form.elements.Objective.value = {cost:'Reduce electricity costs','80':'Target 80% less grid energy','95':'Target 95% less grid energy',resilience:'Backup / resilience'}[saved.goal] || '';
      form.elements.OperatingHours.value = {day:'Primarily daytime (exact hours to follow)',mixed:'Mixed day & night (exact hours to follow)','24':'24-hour operation'}[saved.profile] || '';
      document.getElementById('technical-details').open = true;
      document.getElementById('prefill-note').hidden = false;
    }
  } catch {}
  let widgetId = null, verified = false, pending = false, deliveryError = false;
  let submissionId = crypto.randomUUID();
  form.addEventListener('input', () => { if (!pending) submissionId = crypto.randomUUID(); });
  submit.disabled = true;
  setStatus('Preparing the secure enquiry form…');
  const config = await configPromise;
  if (!config.contactReady) {
    setStatus('Online enquiries are temporarily unavailable. Please use the email, phone or WhatsApp links to contact Yunus.', 'error');
    submit.textContent = 'PLEASE CONTACT US DIRECTLY';return;
  }
  try {
    if (!window.turnstile) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        const timeout = setTimeout(() => reject(new Error()), 15000);
        script.onload = () => { clearTimeout(timeout);resolve(); };
        script.onerror = () => {clearTimeout(timeout);reject(new Error());};
        document.head.append(script);
      });
    }
    widgetId = window.turnstile.render('#turnstile-widget', {
      sitekey:config.turnstileSiteKey,theme:'light',action:'contact',
      callback:() => {verified=true;submit.disabled=false;if (!deliveryError) setStatus('');},
      'expired-callback':() => {verified=false;submit.disabled=true;setStatus('Please complete the security check again.');},
      'error-callback':() => {verified=false;submit.disabled=true;setStatus('The security check could not load. Refresh or contact us directly.','error');}
    });
    setStatus('Complete the security check to send your enquiry.');
  } catch { setStatus('The security check could not load. Refresh or contact us by email, phone or WhatsApp.','error');return; }
  form.addEventListener('submit', async e => {
    e.preventDefault();if(pending || !form.reportValidity()) return;
    if(!verified) {setStatus('Please complete the security check.','error');return;}
    const data=Object.fromEntries(new FormData(form).entries());
    data.turnstileToken=window.turnstile.getResponse(widgetId);data.submissionId=submissionId;
    if(!data.turnstileToken) {setStatus('Please complete the security check.','error');return;}
    pending=true;deliveryError=false;submit.disabled=true;submit.textContent='SENDING…';
    const controls=[...form.querySelectorAll('input,select,textarea')];controls.forEach(el=>el.disabled=true);
    setStatus('Sending your enquiry…');
    try {
      const response=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok || !result.ok) throw new Error(result.error || 'Your enquiry could not be confirmed. Please retry or contact us directly.');
      form.reset();storage.remove('ziya-starting-point');
      form.innerHTML='<div class="success-confirmation" tabindex="-1"><div class="label">ENQUIRY RECEIVED</div><h2>Thank you.</h2><p>Your enquiry has been accepted. Yunus will review your information and contact you about the next step.</p><p class="reference"></p><p>For anything urgent, call <a class="text-link" href="tel:+27685667460">068 566 7460</a>.</p><a class="btn" href="/">RETURN TO HOMEPAGE ↗</a></div>';
      form.querySelector('.reference').textContent='Reference: '+(result.reference || submissionId);
      form.querySelector('.success-confirmation').focus();
      trackEvent('generate_lead');
    } catch (error) {
      controls.forEach(el=>el.disabled=false);
      deliveryError=true;
      setStatus(error.name==='TimeoutError' ? 'Delivery could not be confirmed. Your details are still here; retry or contact us directly.' : error.message,'error');
      verified=false;window.turnstile.reset(widgetId);
      submit.textContent='RETRY ENQUIRY ↗';
    } finally {pending=false;}
  });
})();
