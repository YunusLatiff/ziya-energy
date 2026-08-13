# Ziya Energy V5 — Secure Form

The contact form now submits securely to `/api/contact` on the same Cloudflare Worker and sends the enquiry to `yunus@ziyaenergy.co.za` through Resend.

## Required Cloudflare settings

Set:
- `TURNSTILE_SITE_KEY` — Worker variable
- `TURNSTILE_SECRET` — Worker secret
- `RESEND_API_KEY` — Worker secret

Already configured:
- `FORM_TO_EMAIL = yunus@ziyaenergy.co.za`
- `FORM_FROM_EMAIL = Ziya Energy Website <website@forms.ziyaenergy.co.za>`

## Resend
Verify `forms.ziyaenergy.co.za` in Resend and add its SPF/DKIM DNS records to Cloudflare.

## Deploy
Use:

`npx wrangler deploy`

The website files are now in `/public`; `worker.js` handles the API and serves the static assets.

Do not deploy with `--assets ./`.


## V6 additions
- Homepage quick energy opportunity estimator
- Why Ziya methodology section
- Animated Solar / BESS / Grid / Facility energy-flow visual
- CAPEX, financed ownership and PPA / Energy-as-a-Service section
- What We Analyse section
- Decision-maker FAQ
- Electricity-bill upload (PDF/JPG/PNG, max 5 MB) attached to Resend enquiry email
- Secondary WhatsApp CTA
- SEO: page titles/descriptions, canonical URLs, Open Graph, JSON-LD, favicon, sitemap.xml and robots.txt
- First-party conversion event logging to `/api/event`
- Optional `WEB_ANALYTICS_TOKEN` config placeholder for Cloudflare Web Analytics

### Important
The quick estimator is deliberately screening-level only and states that final sizing requires load-profile, tariff, yield and site data.


## V6.1 simplified enquiry
- Removed client kWh/consumption entry from the enquiry flow.
- Removed electricity bill upload.
- Homepage screening tool now uses monthly bill, operating profile and objective only.
- Reduced enquiry form label and field text sizes.

## V6.2 enquiry update
- Restored monthly electricity usage (kWh) field on the enquiry page.
- Bill upload remains removed.
- kWh usage is included in the Resend enquiry email.

## V6.3 enquiry update
- Split operating schedule into separate Operating days and Operating hours fields.
- Both values are included separately in the enquiry email.
