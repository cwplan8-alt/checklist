# ListChecker — Product Plan

## What It Is
A tool that takes any URL, fetches the page, extracts numbered/bulleted lists, and turns them into an interactive checklist you can check off.

## Deployment Target
- Platform: Render or Railway (long-lived Express server, not Vercel/serverless)
- DB: Neon (Postgres, free tier) — schema already written via Drizzle
- Auth: None yet (Phase 3)
- Stack: Express + React + Tailwind + Drizzle + Zod

---

## Phase 1 — Working + Deployed (done first, no auth needed)
**Goal: Something you can actually use daily and share with friends**

### Server fixes
- [x] Use `process.env.PORT` instead of hardcoded 5000
- [x] Remove `reusePort: true` from server.listen
- [x] Remove `throw err` after response in error middleware
- [x] Add /health endpoint
- [x] Add 10s timeout + 5MB size cap on URL fetch (SSRF protection)
- [x] Fix PATCH route: call `updateChecklistProgress` so completedItems stays accurate on reload

### DB / persistence
- [x] Add `server/db.ts` (Neon + Drizzle connection)
- [x] Add `DatabaseStorage` class — uses Postgres when DATABASE_URL is set
- [x] Fall back to MemStorage when DATABASE_URL is not set (local dev)

### Frontend fixes
- [x] Fix Export button — downloads checklist as .txt
- [x] Fix Print button — calls window.print()
- [x] Remove fake Edit button (no handler, hover-only = broken on mobile)
- [x] Mobile: ensure touch targets are adequate

### Cleanup
- [x] Remove `runtimeErrorOverlay` (Replit-specific, always loaded in prod)
- [x] Remove Replit cartographer plugin from vite.config.ts
- [x] Remove unused `@assets` alias

### Deploy steps (manual)
1. Create Neon account → get DATABASE_URL
2. Set DATABASE_URL env var in Render/Railway
3. Run `npm run db:push` to create tables
4. Build command: `npm install && npm run build`
5. Start command: `node dist/index.js`
6. Add /health as health check path

---

## Phase 2 — Make It Good (polish before monetizing)
**Goal: Parser works reliably, UX is polished, worth sharing to others**

### Core product
- [ ] Extract 683-line parser from routes.ts → `server/parser.ts` (testable, maintainable)
- [ ] Improve parser reliability + better error messages when extraction fails
- [ ] Add rate limiting on /api/process-url (express-rate-limit)
- [ ] Switch checklist IDs to UUIDs (prevent enumeration, enable safe sharing)
- [ ] Add per-checklist share link (public UUID-based URL, loads checklist from DB)

### UX
- [ ] Wire up Share button (Web Share API → clipboard fallback)
- [ ] Make Edit button work (inline rename of checklist item text)
- [ ] Make header nav links go to real anchors (#how-it-works, #examples)
- [ ] Add mobile nav menu (currently hamburger does nothing)
- [ ] Remove unused dependencies (passport, passport-local, express-session, connect-pg-simple, memorystore)

---

## Phase 3 — Monetize (Clerk + Stripe)
**Goal: Turn it into a product you can charge for**

### Auth
- [ ] Add Clerk (OAuth + email, free tier, handles sessions)
- [ ] Per-user checklist ownership
- [ ] Saved checklists history page

### Monetization model
- Usage gate: anonymous users get 3 checklists per session → prompted to sign up
- Feature gate (free account): create + check off items
- Feature gate (Pro): export, share links, history, no limits

### Implementation
- [ ] Stripe for Pro subscription
- [ ] Usage tracking per user
- [ ] Export PDF/CSV (Pro)
- [ ] Shareable public links (Pro)

---

## Monetization Notes
- Freemium: free to start, usage limits + feature gates drive upgrades
- Do NOT add monetization before Phase 2 is solid — product must work reliably first
- Understand what users actually do before deciding what to gate

---

## Technical Debt to Address
- 9 npm audit vulnerabilities (express transitive chain + glob/minimatch)
- Sequential integer IDs expose checklist enumeration (fix in Phase 2 with UUIDs)
- Parser is 683 lines of fragile regex inline in routes.ts (extract in Phase 2)
- No tests (add parser unit tests in Phase 2)
