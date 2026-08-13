const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function clean(value, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\0/g, "").slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function row(label, value) {
  if (!value) return "";
  return `<tr><td style="padding:10px 12px;border-bottom:1px solid #e6e1d7;color:#746f67;font-size:12px;width:34%">${escapeHtml(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #e6e1d7;color:#17181b;font-size:13px">${escapeHtml(value)}</td></tr>`;
}

async function verifyTurnstile(token, ip, secret) {
  const fd = new FormData();
  fd.append("secret", secret);
  fd.append("response", token);
  if (ip) fd.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: fd
  });
  if (!response.ok) return { success: false };
  return response.json();
}


async function sendEmail(env, f) {
  const rows = [
    row("Name", f.name),
    row("Company", f.company),
    row("Email", f.email),
    row("Phone", f.phone),
    row("Facility location", f.location),
    row("Industry", f.industry),
    row("Monthly consumption", f.consumption),
    row("Monthly electricity spend", f.monthlySpend),
    row("Operating days", f.operatingDays),
    row("Operating hours", f.operatingHours),
    row("Existing solar", f.solar),
    row("Existing battery storage", f.battery),
    row("Primary objective", f.objective),
    row("Additional information", f.message)
  ].join("");

  const emailHtml = `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:Arial,sans-serif;color:#17181b"><div style="max-width:720px;margin:0 auto;padding:36px 18px"><div style="background:#111214;padding:26px 30px;border-top:4px solid #c7a35d"><div style="font-weight:800;letter-spacing:3px;color:white">ZIYA <span style="color:#c7a35d;font-weight:500">ENERGY</span></div><h1 style="font-family:Georgia,serif;font-weight:500;color:white;font-size:30px;margin:24px 0 8px">New Energy Assessment</h1><p style="color:#aaa;margin:0">A new enquiry was submitted through ziyaenergy.co.za.</p></div><div style="background:white;padding:18px 20px 26px"><table style="width:100%;border-collapse:collapse">${rows}</table></div></div></body></html>`;

  const payload = {
    from: env.FORM_FROM_EMAIL || "Ziya Energy Website <website@forms.ziyaenergy.co.za>",
    to: [env.FORM_TO_EMAIL || "yunus@ziyaenergy.co.za"],
    reply_to: f.email,
    subject: `New Ziya Energy Assessment${f.company ? ` — ${f.company}` : ""}`,
    html: emailHtml
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "ZiyaEnergyWorker/1.0"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Resend error", response.status, result);
    throw new Error("Email delivery failed");
  }
}

async function parseContactRequest(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("INVALID_CONTENT_TYPE");
  }
  return { body: await request.json() };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/config" && request.method === "GET") {
      return json({
        turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
        analyticsToken: env.WEB_ANALYTICS_TOKEN || ""
      });
    }

    if (url.pathname === "/api/event" && request.method === "POST") {
      try {
        const text = await request.text();
        const event = JSON.parse(text || "{}");
        console.log("analytics_event", {
          event: clean(event.event, 80),
          path: clean(event.path, 200),
          properties: event.properties || {}
        });
      } catch {}
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

      if (!env.RESEND_API_KEY || !env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY) {
        return json({ ok: false, error: "The contact service is not configured yet." }, 503);
      }

      let parsed;
      try {
        parsed = await parseContactRequest(request);
      } catch (err) {
        return json({ ok: false, error: "Invalid form data." }, 400);
      }

      const body = parsed.body;
      if (clean(body.website, 100)) return json({ ok: true });

      const f = {
        name: clean(body.Name || body.name, 120),
        company: clean(body.Company || body.company, 160),
        email: clean(body.Email || body.email, 200),
        phone: clean(body.Phone || body.phone, 80),
        location: clean(body.Location || body.location, 200),
        industry: clean(body.Industry || body.industry, 160),
        consumption: clean(body.Consumption || body.consumption, 120),
        monthlySpend: clean(body["Monthly spend"] || body.monthlySpend, 120),
        operatingDays: clean(body.OperatingDays || body.operatingDays, 160),
        operatingHours: clean(body.OperatingHours || body.operatingHours, 160),
        solar: clean(body.Solar || body.solar, 80),
        battery: clean(body.Battery || body.battery, 80),
        objective: clean(body.Objective || body.objective, 180),
        message: clean(body.Message || body.message, 3000)
      };

      if (!f.name || !f.company || !f.email) {
        return json({ ok: false, error: "Please complete your name, company and email address." }, 400);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
        return json({ ok: false, error: "Please enter a valid email address." }, 400);
      }

      const token = clean(body.turnstileToken, 3000);
      if (!token) return json({ ok: false, error: "Please complete the security check." }, 400);

      const verification = await verifyTurnstile(
        token,
        request.headers.get("CF-Connecting-IP") || "",
        env.TURNSTILE_SECRET
      );
      if (!verification.success) {
        return json({ ok: false, error: "Security verification failed. Please try again." }, 403);
      }
      try {
        await sendEmail(env, f);
        console.log("assessment_success", { company: f.company, objective: f.objective, hasBill: false });
        return json({ ok: true });
      } catch (error) {
        console.error(error);
        return json({ ok: false, error: "We could not send your assessment. Please try again shortly." }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
