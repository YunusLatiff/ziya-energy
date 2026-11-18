# Ziya Energy v7 — website fixes

This is the complete Cloudflare Worker + static-assets project. It preserves the black/gold identity. Public personal names, phone numbers and WhatsApp links have been removed. The production target is the existing `ziya-energy` Worker serving `ziyaenergy.co.za`, connected to `YunusLatiff/ziya-energy` on `main`. See QA.md for installation verification.

## Start here (Windows PowerShell)

Extract this ZIP, open the extracted folder in PowerShell, and run:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run dev
```

Open the local address printed by Wrangler. Node.js 22 or later is recommended. The contact page intentionally shows direct-contact alternatives until its services are configured.

To publish, use the **existing Ziya Cloudflare account and Worker**, confirm the settings below, then run:

```powershell
npx.cmd wrangler login
npm.cmd run deploy
```

This package uses Workers with Static Assets. Uploading only `public` to Pages or drag-and-dropping the ZIP does not deploy the form backend. Keep the existing domain attachment; do not recreate the DNS zone or change nameservers.

`wrangler.jsonc` sets `keep_vars: true` so existing dashboard-defined variables survive deployment. Existing secrets are not included in this ZIP. Verify the Worker name and domain in your account before publishing. No credentials are required to view the local pages.

## Required to send enquiries

The original site already used **Resend** for email and **Cloudflare Turnstile** for anti-spam verification. These still need real account configuration:

1. In Resend, verify your sending domain (`forms.ziyaenergy.co.za` by default) and add the exact DNS records Resend supplies. Confirm that the configured sender is authorised and that you can send to `sales@ziyaenergy.co.za`.
2. In Cloudflare Turnstile, create or use a widget for `ziyaenergy.co.za` and `www.ziyaenergy.co.za`.
3. Set these values in the existing Worker settings (Variables and Secrets):

| Setting | Type | Value |
|---|---|---|
| `TURNSTILE_SITE_KEY` | Variable | Public site key from your Turnstile widget |
| `TURNSTILE_SECRET` | Secret | Matching private secret |
| `RESEND_API_KEY` | Secret | Your email sending API key |
| `FORM_TO_EMAIL` | Variable | `sales@ziyaenergy.co.za` (already in config) |
| `FORM_FROM_EMAIL` | Variable | `Ziya Energy Website <website@forms.ziyaenergy.co.za>` (already in config; change if needed) |
| `ALLOWED_HOSTNAMES` | Variable, optional | Defaults to `ziyaenergy.co.za,www.ziyaenergy.co.za`. Add the exact staging hostname only if testing that domain. |

Never put private keys in `public`, `main.js`, or a Git repository. CLI alternatives for secrets are `npx.cmd wrangler secret put RESEND_API_KEY` and `npx.cmd wrangler secret put TURNSTILE_SECRET`.

4. After deployment, submit one clearly labelled test enquiry using your own details. Confirm the browser reference, receiving inbox and Resend delivery status. Provider acceptance is not proof of final inbox delivery.

The site shows confirmation on screen; it does **not** send an automatic acknowledgement email to the customer. Failed requests preserve the entered details. The confirmation remains visible instead of disappearing after two seconds.

## Optional: durable lead register (recommended)

Without a database, enquiries go to your configured email inbox. For an independent saved record:

```powershell
npx.cmd wrangler d1 create ziya-enquiries
```

Add the returned database ID to the top level of `wrangler.jsonc`:

```json
"d1_databases": [
  {
    "binding": "LEADS_DB",
    "database_name": "ziya-enquiries",
    "database_id": "PASTE_THE_ID_RETURNED_BY_CLOUDFLARE"
  }
]
```

Then initialise and deploy:

```powershell
npx.cmd wrangler d1 execute ziya-enquiries --remote --file=schema.sql
npm.cmd run deploy
```

Records are saved before email is attempted. Statuses are `pending`, `sent` (provider accepted), and `email_failed`. An email failure still shows an error to the customer and keeps the form values. Retries reuse the submission reference; edits create a new reference. Resend idempotency reduces duplicate sends on retries.

Use the Cloudflare D1 console to view records. Monitor pending and email_failed records and follow up manually; there is no automatic retry scheduler or CRM dashboard in this package. This is not a HubSpot connection. Restrict access and agree your retention/deletion procedure before collecting enquiries. The privacy page describes both email-only and database-enabled operation without promising an unimplemented deletion schedule.

## Optional visitor and conversion measurement

No analytics account has been created or connected. Measurement is disabled until you configure a service and the visitor allows it. Set one or more Worker variables:

- `GA_MEASUREMENT_ID`: a real GA4 identifier such as `G-XXXXXXXXXX`.
- `WEB_ANALYTICS_TOKEN`: the 32-character token from Cloudflare Web Analytics.
- `ENABLE_EVENT_LOGGING`: `true` for minimal first-party interaction logs. These logs are diagnostic, not a persistent analytics dashboard.

The consent panel offers Allow measurement / Essential only. Privacy choices in the footer lets visitors change the setting. Turn off any separately injected Cloudflare/Google tracking scripts if they bypass this choice. Do not add a duplicate Google tag through another service.

GA4 receives `generate_lead` only after the server accepts an enquiry. Mark that event as a key event in GA4. Other events: `assessment_cta_click`, `whatsapp_click`, `phone_click`, `email_click`, `quick_estimator_completed`. Contact clicks are not confirmed enquiries. No form values are added to event payloads. Review GA4 Enhanced Measurement settings; do not enable collection of form values, personal data or user-provided data.

## Search visibility: actions in your accounts

The code now includes clean canonical URLs, matching internal links, sitemap, robots file, individual service pages and Organization structured data. It does not create external accounts or guarantee rankings.

1. Add a Domain property for `ziyaenergy.co.za` in Google Search Console. Add the exact DNS verification TXT record it gives you in Cloudflare.
2. Submit `https://ziyaenergy.co.za/sitemap.xml`. Inspect `/`, `/solutions`, `/commercial-solar`, `/battery-storage`, `/power-purchase-agreements` and `/contact` after deployment.
3. Confirm HTTPS and one preferred hostname. If both www and non-www are attached, redirect www to `https://ziyaenergy.co.za`, preserving paths and query strings, using a Cloudflare Redirect Rule. This account-level rule is not included in the ZIP.
4. Test the old `.html` addresses: Cloudflare asset handling should redirect them to the equivalent clean URL. These canonical URLs are intentional.
5. Set up a Google Business Profile only if Ziya meets Google's eligibility rules for its actual operations. Add a real LinkedIn business profile when ready.
6. Publish genuine project examples, customer references and useful articles. Do not add invented project numbers, qualifications, accreditations or partner logos.

## Content for you to confirm

The About page uses the Ziya Energy team as the contact, with the existing business email.

Before launch, confirm your preferred role description, legal business name/registration details, actual service coverage and privacy practices. Add verified team credentials, authorised partner details, project photography and genuine case studies when available. Stock imagery remains illustrative; it is not presented as Ziya project evidence. Privacy text is a plain-language description of the supplied site, not a legal certification.

## Main changes

- Eight focused homepage sections in place of the long repeated sequence.
- Four detailed service pages and an assessment guide with clearly labelled illustrative arithmetic.
- More personal About page, clear next steps and click-to-call links.
- Short enquiry form with expandable optional facility details. Operating days and hours stay separate.
- The quick tool suggests topics to investigate, without producing unsupported performance percentages. It carries answers into the enquiry form within the same tab for one hour.
- Better keyboard navigation, mobile menu labels, focus states, contrast, type sizes and reduced-motion support. Content remains readable with JavaScript disabled.
- No forced redirect after enquiry submission.
- Bounded request parsing, input checks, origin checks, Turnstile hostname/action validation, escaped email content, request timeouts and idempotency keys.
- Optional D1 saved leads; optional consent-controlled GA4 and Cloudflare Analytics.
- Privacy notice, clean canonical URLs, working sitemap, custom 404 and security headers.
- Existing stock photography bundled locally to remove external image-loading dependency.

## Tests and limitations

Run `npm.cmd test` for backend unit tests. Tests mock security and email providers; they never send live emails. Browser fixtures are in `tests/browser.test.cjs` and require Playwright plus a local running preview. See `QA.md` for checks actually completed on this release.

A local preview cannot verify production credentials, DNS, domain attachments, Turnstile configuration or inbox delivery. Those require a real post-deployment test. The original stock photos are bundled locally in public/assets/images. See IMAGE-SOURCES.md for their source URLs.

## Affiliate portal and private CRM

See [AFFILIATE_PORTAL.md](AFFILIATE_PORTAL.md) for account access, isolation, commission rules, schema and deployment verification.
