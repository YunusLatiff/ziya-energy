const m=document.querySelector('.menu'),n=document.querySelector('.nav');if(m&&n)m.onclick=()=>n.classList.toggle('open');const o=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add('show')),{threshold:.08});document.querySelectorAll('.reveal').forEach(e=>o.observe(e));


/* Secure Ziya Energy assessment form */
(() => {
  const form = document.getElementById("energy-assessment-form");
  if (!form) return;

  const status = document.getElementById("form-status");
  const submit = form.querySelector('button[type="submit"]');
  let widgetId = null;
  let verified = false;

  const setStatus = (message, type = "") => {
    status.textContent = message;
    status.className = "form-status" + (type ? ` ${type}` : "");
  };

  async function initTurnstile() {
    try {
      const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error();
      const config = await response.json();
      if (!config.turnstileSiteKey) throw new Error();

      let tries = 0;
      while (!window.turnstile && tries < 50) {
        await new Promise(r => setTimeout(r, 100));
        tries++;
      }
      if (!window.turnstile) throw new Error();

      widgetId = window.turnstile.render("#turnstile-widget", {
        sitekey: config.turnstileSiteKey,
        theme: "light",
        callback: () => { verified = true; setStatus(""); },
        "expired-callback": () => { verified = false; setStatus("Please complete the security check again.", "error"); },
        "error-callback": () => { verified = false; setStatus("The security check could not load. Please refresh the page.", "error"); }
      });
    } catch {
      setStatus("The security check could not load. Please refresh the page.", "error");
    }
  }

  initTurnstile();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("");

    if (!form.reportValidity()) return;
    if (!verified || !window.turnstile || widgetId === null) {
      setStatus("Please complete the security check before submitting.", "error");
      return;
    }

    const token = window.turnstile.getResponse(widgetId);
    if (!token) {
      setStatus("Please complete the security check before submitting.", "error");
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    data.turnstileToken = token;

    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = "SUBMITTING…";
    setStatus("Submitting your assessment…");
    trackEvent("assessment_form_submit");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data)
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "We could not submit your assessment.");

      form.reset();
      window.turnstile.reset(widgetId);
      verified = false;
      setStatus("");

      const existingPopup = document.querySelector(".success-popup-overlay");
      if (existingPopup) existingPopup.remove();

      const popup = document.createElement("div");
      popup.className = "success-popup-overlay";
      popup.innerHTML = `
        <div class="success-popup-card" role="dialog" aria-modal="true" aria-labelledby="success-popup-title">
          <div class="success-popup-check">✓</div>
          <div class="label">ENQUIRY RECEIVED</div>
          <h2 id="success-popup-title">Thank you.</h2>
          <p>Your energy assessment has been submitted successfully.</p>
          <p class="success-popup-sub">A member of Ziya Energy will be in touch shortly.</p>
          <div class="success-popup-redirect">Returning you to the homepage…</div>
        </div>
      `;
      document.body.appendChild(popup);
      document.body.classList.add("popup-open");
      trackEvent("assessment_form_success");
      requestAnimationFrame(() => popup.classList.add("show"));

      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (error) {
      setStatus(error.message || "We could not submit your assessment. Please try again.", "error");
      if (window.turnstile && widgetId !== null) {
        window.turnstile.reset(widgetId);
        verified = false;
      }
    } finally {
      submit.disabled = false;
      submit.textContent = original;
    }
  });
})();



/* Indicative energy opportunity estimator */
(() => {
  const form = document.getElementById("quick-estimator");
  if (!form) return;

  const result = document.getElementById("estimator-result");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const bill = Number(document.getElementById("est-bill").value);
    const profile = document.getElementById("est-profile").value;
    const goal = document.getElementById("est-goal").value;

    if (!bill || bill <= 0) return;

    let direction = "Cost optimisation";
    let system = "Solar PV";
    let reduction = "30–60%";
    let priority = "Tariff + load profile";

    if (goal === "80") {
      direction = "High grid reduction";
      system = "Solar PV + BESS";
      reduction = "70–85%";
      priority = "Load profile + storage";
    } else if (goal === "95") {
      direction = "Maximum grid reduction";
      system = "Solar PV + larger BESS";
      reduction = "85–95%";
      priority = "Detailed interval data";
    } else if (goal === "resilience") {
      direction = "Resilience + continuity";
      system = "Hybrid PV + BESS";
      reduction = profile === "24" ? "35–65%" : "45–75%";
      priority = "Critical-load analysis";
    } else if (profile === "24") {
      direction = "Load shifting + savings";
      system = "Solar PV + BESS";
      reduction = "40–70%";
      priority = "Time-of-use optimisation";
    }

    document.getElementById("est-direction").textContent = direction;
    document.getElementById("est-system").textContent = system;
    document.getElementById("est-grid").textContent = reduction;
    document.getElementById("est-priority").textContent = priority;
    document.getElementById("est-note").textContent =
      "Indicative screening only. Final recommendations are based on tariff structure, operating profile, interval data and site constraints after initial engagement.";

    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    trackEvent("quick_estimator_completed", { goal, profile });
  });
})();

/* Optional Cloudflare Web Analytics + first-party conversion event logging */
function trackEvent(name, properties = {}) {
  try {
    navigator.sendBeacon?.("/api/event", JSON.stringify({
      event: name,
      properties,
      path: location.pathname,
      ts: Date.now()
    }));
  } catch {}
}

document.querySelectorAll('a[href*="contact.html"]').forEach(a => {
  a.addEventListener("click", () => trackEvent("assessment_cta_click", { text: a.textContent.trim() }));
});

document.querySelectorAll(".floating-whatsapp,.contact-whatsapp").forEach(a => {
  a.addEventListener("click", () => trackEvent("whatsapp_click"));
});
