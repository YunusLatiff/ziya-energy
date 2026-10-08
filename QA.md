# Release checks — Ziya Energy v7

## Installation verification — 8 October 2026

- Verified the existing GitHub repository is `YunusLatiff/ziya-energy`, production branch `main`, connected to the existing Cloudflare Worker `ziya-energy` serving `ziyaenergy.co.za`.
- Preserved the existing Turnstile site key, email variables, analytics setting and `ASSETS` binding. Production contains `RESEND_API_KEY` and `TURNSTILE_SECRET`; secret values are not stored in this repository. `keep_vars: true` retains dashboard variables.
- Updated Wrangler to 4.148.0 and overrode its transitive `sharp` dependency to patched version 0.35.5. `npm audit` reports zero vulnerabilities.
- All 11 backend tests and both JavaScript syntax checks passed. Wrangler deployment dry-run passed with 37 static files.
- Full local Wrangler preview worked on Windows. Browser tests passed all 13 views at 1440, 390 and 320 pixels, mobile menu interaction, calculator handoff, unavailable-service fallback, mocked email failure/retry and conversion tracking.
- HTTP checks confirmed all 12 content pages match the replacement source, internal targets respond successfully, `.html` URLs redirect, custom 404 works, invalid forms are rejected and security headers are present.
- Desktop homepage and mobile contact screenshots were inspected. Provider acceptance and inbox delivery still require a real production enquiry; automated provider tests use mocks.

## Original package verification

Completed on 30 September 2026.

- JavaScript syntax checks passed for Worker and browser scripts.
- 11 backend tests passed, covering configuration, input validation, payload limits, cross-origin rejection, challenge validation, email payload escaping, idempotency key, provider outages, optional database writes and minimal analytics logging.
- Cloudflare Wrangler deployment dry-run successfully bundled the Worker and recognised its assets configuration. No live deployment was performed.
- Local internal-page and fragment checks found no broken targets. Every HTML page has one main heading; homepage contains eight sections.
- Automated Chromium checks passed across all 13 page views at 1440px, 390px and 320px widths with no horizontal overflow.
- Mobile menu opening, closing and Escape behavior passed.
- Starting-point tool correctly labels the percentage as a customer target, with performance requiring site modelling; bill, objective and operating pattern carry to the enquiry form.
- Unconfigured contact services produce a clear direct-contact message and disabled submission button.
- Local browser fixtures tested a failed email request, retained field values, retry, visible success reference, no forced redirect and exactly one generate_lead event after success.
- Desktop homepage and mobile contact screenshots were visually inspected. Original stock photography is bundled locally.

## What these checks do not establish

Provider calls were mocked in automated tests. No production email was sent, and production DNS, account permissions, Turnstile credentials, Google accounts, live database bindings and inbox delivery were not tested. The full Wrangler development server could not start in this execution environment because its network-interface discovery failed; browser checks used a local static preview and mocked API responses instead. Production connection steps and the post-deployment test are in README.md.

The browser tests require Playwright and a local preview. Run `npm run dev` in one terminal, install Playwright separately for testing, then run `node tests/browser.test.cjs` in another. Set PREVIEW_URL if your local port differs from 8787. The default npm test command runs the backend tests without any external providers.
