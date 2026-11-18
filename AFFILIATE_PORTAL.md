# Ziya Energy affiliate portal

Public portal: `https://ziyaenergy.co.za/affiliates`. Owner CRM: `https://ziyaenergy.co.za/admin`.

Affiliates create an account with name, surname and email, verify a single-use email link, and receive a private workspace with onboarding instructions, client submission, deal progress, timelines, commission totals, search, filters and CSV export. Owner updates are fetched every 20 seconds while the page is visible and on returning to the tab. An open edit dialog is retained to protect unsaved changes; its version check rejects conflicting updates.

## Owner access

Sign in using the email in `AFFILIATE_ADMIN_EMAIL` (currently `yunus@ziyaenergy.co.za`). A visitor cannot choose or submit an admin role. The server checks the verified email on every request. All other verified users receive affiliate access. `/admin` contains only the application shell: data is returned by authenticated endpoints after owner checks.

Email links expire after 15 minutes and can be redeemed only once by a same-origin POST. Sessions last seven days in a Secure, HttpOnly, SameSite=Lax host-only cookie. Database session and email tokens are SHA-256 hashes, and sign-in and referral submission are rate limited. Only the sender address, Resend API key and owner email configured on Cloudflare can be used by the sign-in flow.

## Commission calculation

Commission is always 3% of the final deal value entered by the owner, stored as integer cents and rounded to cents. The owner should enter the agreed commissionable deal value consistently. The system does not independently determine VAT treatment. Before completion figures are estimates; marking a positive-value deal completed makes commission earned. Marking paid requires a payment reference and records a timestamp. Paid values and completion status are locked. Payments are recorded only; this application does not transfer money.

Client permission is required on submission. Client attribution is derived from the authenticated session, ignoring browser-supplied user IDs or commission amounts. Database queries restrict affiliates to their own rows, including history. Private admin notes, audit details and the affiliate directory are never returned to affiliate sessions. Client submissions and history events are transactional; updates use a version check.

## Cloudflare

Existing Worker `ziya-energy` and domain attachments are preserved. D1 binding `AFFILIATES_DB` uses database `ziya-affiliates`. Schema: `migrations/0001_affiliates.sql`. The initial schema was applied in the Cloudflare console before deployment. `RESEND_API_KEY` and `TURNSTILE_SECRET` remain Cloudflare secrets and are never committed. Existing website enquiries continue through the original contact handler.

Required variables: `AFFILIATE_ADMIN_EMAIL`, `AFFILIATE_ORIGIN`, `FORM_FROM_EMAIL`. Optional public measurement uses `GA_MEASUREMENT_ID`; the current Ziya stream is `G-FBH4JRYNVE`. The public website loads analytics only after visitor consent. Affiliate and admin pages do not load analytics or send client data to Google. Google Search Console uses the site verification meta tag in the homepage; preserve it.

Deployment: push tested changes to `main`; the existing Cloudflare Workers build runs `npx wrangler deploy`. Run migrations separately before code requiring a new schema. Keep the existing custom-domain attachments and secrets. Cloudflare D1 Time Travel provides recovery; the database can also be exported using an authenticated Wrangler CLI.

## Verification

`npm test` runs contact-handler and affiliate API tests using an in-memory SQLite adapter. Tests cover cross-affiliate list/history access, owner-only mutations, forged attribution, private-note separation, 3% rounding, completion/payment controls, conflicting versions, single-use and expired links, disabled accounts, CSRF rejection, rate limits, consent and duplicates. Browser verification uses only local test accounts and confirms client submission, owner updates, affiliate synchronization and calculated earnings. No sample accounts or deals are installed in production.
