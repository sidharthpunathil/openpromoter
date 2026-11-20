# Deployment: Railway, aiworkmagic.co, Resend and Dodo Payments

How this fork runs in production. It covers hosting, the domain, email and billing.
Secrets never go in this file. They live in Railway variables and in the local `.env`.

## Overview

| Piece | Where |
|---|---|
| Code | `github.com/sidharthpunathil/openpromoter`, branch `main` |
| App | Railway project `openpromoter`, service `app`, built from the `Dockerfile` |
| Database | Railway service `Postgres` in the same project |
| Public URL | `https://affiliate.aiworkmagic.co` |
| Fallback URL | `https://app-production-f9f1dc15.up.railway.app` |
| DNS | Cloudflare, zone `aiworkmagic.co` |
| Email | Resend, sending domain `aiworkmagic.co` |
| Billing | Dodo Payments webhooks |

## Deploys

Railway deploys every push to `main` on the fork. Database migrations run when the container starts.

```bash
git push origin main                  # deploys
railway status                        # this folder is linked to the project
railway logs --service app --lines 100
railway redeploy --service app -y     # rebuild without a new commit
```

Health check: `GET /api/health` returns 200 when the app and database are up.

## Environment variables

Set these on the `app` service in Railway. `.env.example` lists every option.

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (a Railway reference) |
| `APP_URL` | The public URL, written out in full |
| `BETTER_AUTH_SECRET` | Random 64-character hex string |
| `ENCRYPTION_KEY` | Random 64-character hex string |
| `RESEND_API_KEY` | A Resend key with sending access |
| `EMAIL_FROM` | `AI Work Magic <affiliates@aiworkmagic.co>` |
| `HOSTED_MODE` | `false` |
| `RUN_WORKER` | `true` (the background worker runs inside the app) |
| `SEED_DEMO` | `false` |
| `PORT` | `3000` |
| `DATABASE_POOL_MAX` | `10` |
| `RATE_LIMIT_STORE` | `postgres` |
| `TRUSTED_IP_HEADER` | `cf-connecting-ip` (the visitor's IP from Cloudflare) |
| `PEER_IP_HEADER` | `x-real-ip` (Railway overwrites it with the connecting address) |
| `WORKSPACE_CREATORS` | `sidharth@cofount.com` (only this account can start a workspace) |

Write `APP_URL` as a plain URL. A `${{RAILWAY_PUBLIC_DOMAIN}}` reference switches to a new custom domain as soon as it is added, before its DNS works. Sign-in follows `APP_URL`, so a domain that isn't live yet locks everyone out.

Never change `ENCRYPTION_KEY` after setup. It encrypts the saved provider secrets, which can't be read with a new key. A new `BETTER_AUTH_SECRET` signs everyone out.

Generate a secret with `openssl rand -hex 32`.

The Railway domain can be reached without going through Cloudflare, so anyone can send a fake `cf-connecting-ip` there. With `PEER_IP_HEADER` set, the app only believes `cf-connecting-ip` when the request came from a Cloudflare address. Otherwise it uses the address Railway saw. Rate limits and fraud checks then see the real visitor either way.

Outgoing webhooks only go to public addresses. Set `ALLOW_PRIVATE_WEBHOOKS=true` if one of yours must reach a private address.

## Custom domain

`affiliate.aiworkmagic.co` is the only custom domain on the `app` service (target port 3000). Its records in Cloudflare:

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `affiliate` | `qvuxla2z.up.railway.app` | Proxied |
| TXT | `_railway-verify.affiliate` | The `railway-verify=...` value from Railway | DNS only |

Railway hands out a new CNAME target whenever the domain is added again, so update the CNAME to match. Keep SSL/TLS on Full while the record is proxied.

`APP_URL` is `https://affiliate.aiworkmagic.co`. If it changes, update every URL that points at the old one: the Dodo webhook, and the Google and GitHub sign-in callbacks if you use them.

Check the domain with `railway domain` or `dig affiliate.aiworkmagic.co`.

## Products

aiworkmagic.co is a studio of small products, and this OpenPromoter runs the affiliate program for each of them. Every product is a program in its own workspace, at `https://affiliate.aiworkmagic.co/p/<slug>`. Programs have no custom domain set in the app, so every link the app builds uses `affiliate.aiworkmagic.co`.

A product's own subdomain is a Cloudflare redirect. Railway's plan caps custom domains per service, and redirects have no cap. Your Love Wrapped works this way: `creators.yourlovewrapped.com` is a proxied `AAAA` record to `100::` plus four Single Redirect rules in the `yourlovewrapped.com` zone, checked in this order:

| Path on the product subdomain | Redirects to `https://affiliate.aiworkmagic.co` |
|---|---|
| `/` | `/p/your-love-wrapped` (302) |
| `/apply...`, `/portal...` | `/p/your-love-wrapped` + the path (302) |
| App paths: `/login`, `/signup`, `/forgot`, `/reset`, `/api/`, `/_next/`, `/app`, `/admin`, `/invite`, `/oauth`, `/mcp`, `/network`, `/partners`, `/embed`, `/onboarding`, `/demo`, `/p/`, `/r/`, `/op.js` | the same path (307) |
| Anything else, such as a partner short link | `/r/your-love-wrapped/l` + the path (302) |

Query strings carry over, so `?via=` survives the redirect.

To add a product:

1. Create its program in the app, in a new workspace, and note the slug.
2. In the product's Cloudflare zone, add a proxied `AAAA` record for the subdomain pointing to `100::`, and copy the four rules with the new host and slug. Add them to the zone's existing redirect rules; replacing the ruleset would drop rules already there.
3. Connect billing for the workspace. Products that share one Dodo business each need their own webhook endpoint, `https://affiliate.aiworkmagic.co/api/webhooks/dodo/<workspaceId>`.
4. On the product's site, set `NEXT_PUBLIC_OPENPROMOTER_URL=https://affiliate.aiworkmagic.co` and `NEXT_PUBLIC_OPENPROMOTER_PROGRAM=<slug>` to load op.js, and pass the click id as `op_click` in checkout metadata.

A program can still have its own custom domain on Railway, which keeps the product's name in the address bar, but each one takes one of the service's few domain slots. For those, Verify requests `https://<domain>/api/domain-proof` instead of comparing the CNAME, since Railway gives each domain its own target.

## Email (Resend)

`aiworkmagic.co` is verified in Resend, and its records are in Cloudflare. The app sends account email, partner invites, payout notices and reports through `RESEND_API_KEY`. Mail goes out from `EMAIL_FROM`.

OpenPromoter only sends email. Replies go to the Reply-to address set on each program in Settings, so set that to a real inbox.

Without `RESEND_API_KEY` or `SMTP_URL`, emails are written to the logs and never sent.

## Billing (Dodo Payments)

1. In OpenPromoter, open Settings > Integrations and copy the Dodo Payments webhook URL.
2. In Dodo, open Developer > Webhooks and add an endpoint with that URL.
3. Subscribe it to `payment.succeeded`, `refund.succeeded`, `dispute.*` and `subscription.*`.
4. Paste its signing secret (`whsec_...`) into the Dodo Payments card and save.

Test mode in Dodo has its own endpoints and secrets. Turn on Sandbox before saving a test mode secret.

Your checkout passes the click ID so each sale finds its partner:

- Checkout session: `metadata: { op_click: window.openpromoter.clickId }`
- Payment link: add `?metadata_op_click=<clickId>` to the link

A partner's coupon code credits them too. Commissions are figured on the amount before tax. The adapter is `apps/app/src/server/billing/dodo.ts`, and the README covers how refunds work.

## Local development

The repo root `.env` holds local secrets and is gitignored. Next.js reads `apps/app/.env.local`, so copy the values you need there.

```bash
pnpm install
docker compose up -d postgres mailpit
cp .env.example apps/app/.env.local
pnpm db:migrate && pnpm db:seed
pnpm --filter @openpromoter/app dev   # http://localhost:3000
```

## Agent skills

Skills from `obra/superpowers`, `mattpocock/skills` and `GoogleChrome/modern-web-guidance` are installed in `.claude/skills/`. That folder is gitignored, so each machine installs its own copy.
