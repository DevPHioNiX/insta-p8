# InstaAuto — setup notes (local reference)

Clone of https://github.com/ayuuxh2/insta-p8 (self-hosted ManyChat alternative).
Stack: Next.js 16 App Router, React 19, Supabase Postgres, Instagram Graph API (Business Login).
Package manager: npm (package-lock.json). Node v24.12 / npm 9.6.3 on this machine.

## Setup log

| Date | Step | Status |
|------|------|--------|
| 2026-11-18 | Cloned repo into this folder | done |
| 2026-11-18 | Security skim of code (outbound URLs, scripts, no postinstall) | clean |
| 2026-11-18 | `npm install` | done (npm audit warnings, ignored) |
| 2026-11-18 | Created `.env.local` from `.env.example`, generated random `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | done |
| 2026-11-18 | `npx next build` | passes (with empty env) |
| 2026-11-18 | Supabase project created (ref `tfkstxlblqwokkrqohbm`); URL + publishable key put in .env.local | done |
| 2026-11-18 | Supabase secret key → `SUPABASE_SERVICE_ROLE_KEY` (new-style `sb_secret_` keys work with this code) | done |
| 2026-11-18 | `schema.sql` run — verified via REST: 12 tables + `rpc/bump_unlock_attempt` | done |
| — | pg_cron enable + `cron.schedule('purge-unlock-attempts', ...)` (SUPABASE_SETUP.md §2) | unverified — optional cleanup |
| 2026-11-18 | IG `locifyshop` switched to Professional; "Allow access to messages" enabled (mobile app only) | done |
| 2026-11-18 | Meta app created, business portfolio linked, Unified-login configuration created → `META_LOGIN_CONFIG_ID=1128454803418479` in .env.local (custom var, used later for SaaS login flow) | done |
| 2026-11-18 | System-user token generated (system user `instaauto-bot`, id 122106768723547565) → `META_SYSTEM_USER_TOKEN` in .env.local. Perms granted: instagram_basic, _manage_comments, _manage_messages, _content_publish | done |
| 2026-11-18 | Verified: token REJECTED by graph.instagram.com ("Cannot parse access token") → confirms code port to graph.facebook.com needed | confirmed |
| 2026-11-18 | Meta app name = **NixAuto**; business portfolio = "Phionix Gaming". Portfolio had NO Instagram profiles → must add via Business assets → Instagram profiles → Add first | noted |
| 2026-11-19 | IG asset assigned to system user → **phionix.gaming** (IG id `17841447492604305`). NOT locifyshop. Verified on graph.facebook.com: profile, /media, /conversations, /messenger_profile, /subscribed_apps all OK (subscribed_apps empty) | done |
| 2026-11-19 | **Code ported to graph.facebook.com** (see "Port" section). `tsc --noEmit` passes | done |
| 2026-11-19 | Added `scripts/connect-system-user.mjs` (replaces OAuth: upserts users row from META_SYSTEM_USER_TOKEN) | done |
| 2026-11-19 | connect script failed: `permission denied for table users` (42501) — new Supabase projects don't grant API roles. Fix = `scripts/09-grant-service-role.sql` | done — user ran SQL; script re-run OK: users.id=1 = @phionix.gaming |
| 2026-11-19 | Meta App ID `2194193674517611` → INSTAGRAM_APP_ID + NEXT_PUBLIC_INSTAGRAM_APP_ID. App Secret still missing (user sent what looked like a password — not saved) | done |
| 2026-11-19 | App Secret saved as INSTAGRAM_APP_SECRET + META_APP_SECRET; verified via GET /app with app token → "NixAuto" | done |
| 2026-11-19 | Local test (user's own `next dev` already on :3000): `/api/instagram/media?userId=1` returns phionix.gaming post via graph.facebook.com ✅; webhook GET verify echoes challenge ✅ | done |
| 2026-11-19 | `winget install cloudflared` denied by permission classifier → user must install / allow, or use Vercel | blocked |
| — | Subscribe IG account to app webhooks: POST /{igId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,comments,... | TODO (after webhook URL) |
| — | Public HTTPS (tunnel or Vercel) for webhook | TODO (user installs cloudflared + runs tunnel, sends URL) |
| — | Groq API key (optional, AI replies) | TODO (user) |

## Env vars actually read by code (grep `process.env`)

Required:
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (anon key in .env.example but not read in app/lib code)
- `NEXT_PUBLIC_INSTAGRAM_APP_ID`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` — use the **Instagram app ID/secret** from Instagram product page, NOT parent Meta app ID
- `NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI` — must match Meta "OAuth redirect URIs" exactly
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` — already generated in .env.local; paste same into Meta webhook form

Optional:
- `GROQ_API_KEY` (or `OPENAI_API_KEY` + `AI_BASE_URL` + `AI_MODEL`) — AI auto-reply
- `META_APP_SECRET` — only if webhook signature check gives 401s
- `DISABLE_WEBHOOK_SIGNATURE_CHECK` — debug only, don't use in prod

README mentions `GATEWAY_SECRET` / `API_SECRET_KEY` — NOT used by app code (only `scripts/test_upload.py`). Ignore.

## Gotchas found
- Webhook (`/api/instagram/webhook`) needs public HTTPS; localhost won't receive events.
- Meta app in Development mode = only works for accounts added as testers/roles. Own account is fine.
- `.mcp.json` in repo points at the **author's** Supabase projects — don't approve/use it.
- `schema.sql` must be run by hand in Supabase SQL editor (RLS policies). Expect 12 tables.
- pg_cron cleanup job: see SUPABASE_SETUP.md §2.
- IG account `locifyshop` → switch to Professional (Business). Must then enable Settings → Messages → Connected tools → "Allow access to messages" or DM API fails.
- Meta dashboard (Nov 2026): new apps only get **"API setup with Unified login"** — a DIFFERENT API from the Instagram Login this code uses (see BLOCKER below; earlier note calling it a rename was wrong). Unified login requires connecting a **Business portfolio** (free, create inline; no business verification needed for own-account dev use). Do NOT use "API setup with Facebook login" (legacy; needs FB Page). Code uses `instagram.com/oauth/authorize` with `instagram_business_basic,_manage_messages,_manage_comments` scopes (components/layout/landing-page.tsx).
- `.env*` is gitignored (except .env.example) — secrets safe from commits.

## BLOCKER (2026-11-18): Meta API mismatch
New Meta apps show "API setup with Instagram login is not available for newer apps. Your app uses API setup with Unified login instead."
- Repo code = **Instagram Login** only: OAuth `instagram.com/oauth/authorize` → `api.instagram.com/oauth/access_token` → `graph.instagram.com` (`ig_exchange_token`, `/me/messages`, `/me/media`, `/me/messenger_profile`).
- Unified login (per Meta docs) = **Business Integration System User Access Token**, host **graph.facebook.com**, config created in dashboard ("Create new configuration": SUAT, never expires, perms ads_management, ads_read, instagram_basic, instagram_manage_messages, instagram_manage_comments, instagram_content_publish).
- Files hitting graph.instagram.com: lib/instagram-api.ts (GRAPH const), app/api/instagram/{callback,media,send-message,webhook}/route.ts, app/api/inbox/send/route.ts, app/api/ice-breakers/route.ts.
- `/me` with a system-user token = the system user, NOT the IG account → endpoints need explicit `/{ig-user-id}/...`.
- Upstream repo has no issue/fix for this as of 2026-11-18.
- Owner FB account = "Phionix Gaming" (admin via business portfolio). Its IG is already a portfolio asset → can't be added as Instagram Tester ("user with a role on owning business" error). For portfolio-owned IG accounts: get token via Business Manager → System users → assign app + IG asset → Generate token (never expire). Tester invites only for IG accounts outside the portfolio.
- User asked (2026-11-18) about making it SaaS. Shortcut (dashboard SUAT) = own account only. SaaS needs: Unified-login OAuth port + Meta Tech Provider + business verification + App Review (Advanced Access). Host/endpoint swap (graph.facebook.com, /{ig-id}/...) is shared by both paths → do it first, add login flow later. User chose shortcut first (2026-11-19).

## Port to Unified login (2026-11-19, own-account shortcut)
- `lib/instagram-api.ts`: `GRAPH = graph.facebook.com/v24.0` (exported); new `IGAuth {token, igId}` + `igAuth(user)`; send helpers + replyToComment take `IGAuth` and post to `/{igId}/messages`. fetchProfile/verifyIdOwnership still take raw token.
- `igId` comes from `users.page_id` (TEXT). Reason: `business_account_id`/`id` are BIGINT → 17-digit IG ids exceed 2^53 and lose precision in JS.
- webhook/route.ts is `@ts-nocheck` (tsc won't catch errors there): sendAutomationResponse takes IGAuth; call sites use `igAuth(user)`; verifyFollowStatus keeps raw token, host → GRAPH.
- media, send-message, inbox/send, ice-breakers routes → `${GRAPH}/${igId}/...`.
- NOT ported: `app/api/instagram/callback` + landing-page OAuth button (Instagram Login). Replace later with Unified login (FB Login for Business + `META_LOGIN_CONFIG_ID`) for SaaS.
- Shortcut users row: `id=1` (small on purpose, precision); username/page_id/business_account_id = IG account. Dashboard login: localStorage `ig_user_id=1`, `ig_username=phionix.gaming`.

## Key files
- `app/api/instagram/webhook` — event receiver
- `app/api/instagram/callback` — OAuth token exchange
- `lib/ai-reply.ts` — AI provider resolution
- `schema.sql`, `SUPABASE_SETUP.md`
