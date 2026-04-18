@AGENTS.md

# Ambo — Project Memory

## What this is
A sacred writing workspace for Catholic priests. Three modes: Read (liturgical readings), Write (homily editor), Preach (delivery). Commercial side project for Jonathan Stephens (jonathan@beardfish.co). No development budget — Claude builds everything. No AI writing assistance (aligned with Pope Leo XIV's guidance).

## Live URLs
- App: https://amboapp.vercel.app
  ⚠️ This is the production alias — always use it. Never use a deployment-specific URL like
  `amboapp-<9char-hash>-beardfish-cos-projects.vercel.app`: those are frozen single-build
  snapshots and will never update. If ever unsure, verify at Vercel → Settings → Domains.
- GitHub: https://github.com/beardfish-co/amboapp
- Supabase: https://jowbavogcjozxpujwwah.supabase.co

## Credentials
- Supabase URL: https://jowbavogcjozxpujwwah.supabase.co (safe to commit)
- GitHub PAT: ask Jonathan — generate at github.com/settings/tokens if expired
- Resend API key: ask Jonathan (stored in his password manager)

## Tech stack
- Next.js 16.2.4, App Router, TypeScript, Tailwind 4
- Supabase (auth + PostgreSQL with RLS), @supabase/ssr
- Vercel (auto-deploy from GitHub main branch)
- Universalis API for liturgical readings (JSONP)
- Resend for transactional email (SMTP configured in Supabase)

## Design system
- Aesthetic: Apple Glass — cool blue-grey, translucent, minimal
- Background: `#EEF2F7`, Accent: `#4A6FA5`
- Key classes in `app/globals.css`: `.glass-card`, `.mode-pill`, `.mode-pill-btn`, `.ambo-para-wrapper`, `.ambo-drag-handle`

## Architecture

### Auth flow
- Magic link only (no passwords). Rate limit: use Resend SMTP (configured).
- `app/login/page.tsx` → `supabase.auth.signInWithOtp()` with `emailRedirectTo: window.location.origin + "/auth/callback"`
- `app/auth/callback/route.ts` → exchanges OTP code for session, redirects to `/`
- `middleware.ts` → skips `/api` and `/auth` routes entirely (early return); gates all other routes; unauthenticated → `/login`
- Supabase Site URL must be the Vercel domain (not localhost)
- Supabase Redirect URLs must include: `https://[vercel-domain]/auth/callback`
- Resend SMTP in Supabase: host=smtp.resend.com, port=465, user=resend, pass=API key, from=onboarding@resend.dev

### Readings (Read view)
- `app/api/readings/route.ts` — proxy to Universalis
  - Endpoint: `https://universalis.com/{YYYYMMDD}/jsonpmass.js`
  - Strip JSONP: `text.match(/^universalisCallback\(([\s\S]*)\);\s*$/)`
  - Fields: `Mass_R1`, `Mass_Ps`, `Mass_R2`, `Mass_G`
  - Cache: `next: { revalidate: 3600 }`
- `app/components/ReadingView.tsx`
  - `getComingSunday()` exported for WriteView — returns next Sunday (or today if Sunday)
  - Sunday shown prominently as primary section; fetches `sundayStr` date
  - Today's weekday readings hidden behind a collapsible toggle (`showToday` state)
  - Error state with Retry button if Sunday fetch fails (`sundayError` state, `retryKey` to re-trigger)
  - `expandedId` tracks which reading card is open

### Write view (`app/components/WriteView.tsx`)
- Paragraph-based editor, each paragraph is an auto-growing textarea
- Enter = new paragraph, Backspace on empty = delete paragraph
- Drag-to-reorder with HTML5 drag API + undo toast (`justMoved`, `undoStack`)
- Title input with Sunday name suggestion (from Universalis dayName)
- Save: localStorage immediately + Supabase debounced 1.2s; pending save flushed on homily switch + tab hide
- Load: by `currentId` prop (owned by `app/page.tsx`); first save of a null id inserts a new row
- Shows 'My homilies' button that opens the HomilyList drawer

### Preach view (`app/components/PreachView.tsx`)
- Takes `currentId` prop; loads that homily from Supabase, falls back to localStorage cache when offline
- Scroll mode or Step mode (Prev/Next paragraph)
- Adjustable font size (A buttons, 18–36px)

### Database schema
See `migrations/` for the SQL history. Current shape:
```sql
create table homilies (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  sunday_date date,  -- which Sunday this homily is for (nullable)
  title text not null default '',
  content text not null default '',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table homilies enable row level security;
-- RLS: each priest sees only their own homilies
create policy "Users can read own homilies" on homilies for select using (auth.uid() = user_id);
create policy "Users can insert own homilies" on homilies for insert with check (auth.uid() = user_id);
create policy "Users can update own homilies" on homilies for update using (auth.uid() = user_id);
create policy "Users can delete own homilies" on homilies for delete using (auth.uid() = user_id);
```

### Supabase clients
- `lib/supabase/client.ts` — browser client (`createBrowserClient`)
- `lib/supabase/server.ts` — server client using `cookies()` and `SetAllCookies` type from `@supabase/ssr`
- `middleware.ts` — uses `createServerClient` + `SetAllCookies` (required to avoid TypeScript errors)

## Pushing to GitHub
Always clone fresh — never push directly from the outputs dir:
```bash
PAT="<ask Jonathan>"
REPO="beardfish-co/amboapp"
cd /tmp && rm -rf ambo-push-X && mkdir ambo-push-X && cd ambo-push-X
git clone https://$PAT@github.com/$REPO.git .
git config user.email "jonathan@beardfish.co"
git config user.name "Jonathan Stephens"
cp /sessions/clever-funny-ride/mnt/outputs/amboapp/[changed-file] [changed-file]
git add [changed-file]
git commit -m "description"
git push origin main
# NEVER put the PAT in committed files — GitHub push protection will block it
```

## Past bug (resolved 2026-04-18) — ReadingView showing demo data

**Symptom was:** Production app showed the pre-API demo placeholder readings (Acts 5:27-32 / Psalm 30 / John 21:1-14) instead of live Universalis data, no matter how many times the latest commit was redeployed. Changes to `layout.tsx` (title, etc.) never appeared.

**Root cause was NOT the code.** It was that `CLAUDE.md` listed a deployment-specific URL (`amboapp-r7rlzfp1h-beardfish-cos-projects.vercel.app`) as the app URL. Those URLs are frozen snapshots of a single past build — they never update. The production alias is `amboapp.vercel.app`. Every test was hitting the museum.

Supabase's Site URL was also set to the frozen URL, so magic links kept dragging the user back there after sign-in, reinforcing the illusion that the bug was on production.

**Fix applied:** Updated Supabase Site URL and Redirect URLs to `https://amboapp.vercel.app`. Updated this file to reflect the real URL. Also added `export const dynamic = "force-dynamic"` to `app/layout.tsx` as belt-and-braces against Next.js 16 static pre-rendering; safe to remove if it causes issues — it wasn't the actual cause.

**Lesson for future Claude sessions:** If a deploy 'doesn't propagate,' don't assume a code or cache problem. FIRST go to Vercel → Settings → Domains and confirm what URL the project actually serves at, compare to whatever URL is being tested. A clean `<project>.vercel.app` is production; anything with a 9-character random hash in the middle is a frozen deployment.

## Pending work (priority order)
1. ~~Fix ReadingView bug~~ — resolved 2026-04-18 (see post-mortem above)
2. ~~Multiple homilies~~ — shipped 2026-04-18 (HomilyList drawer, switch/create/delete, Preach syncs by active id)
3. ~~Preach view Supabase sync~~ — shipped 2026-04-18 (folded into Multiple homilies; PreachView now loads by `currentId`)
4. **Custom domain** — still on auto-generated Vercel URL
5. ~~Sunday-aware homilies~~ — shipped 2026-04-19 (sunday_date column, date picker, Readings panel in Preach, Sunday chips in list)
6. ~~Readings drawer in Write view~~ — shipped 2026-04-19 (right-side drawer, paragraph-level Insert, quote blocks render italic + citation in both Write and Preach)
7. **Writing surface polish** — formatting (bold/italic), paragraph types, rich-text toolbar

## New multi-homily architecture notes
- `app/page.tsx` owns `currentId: string | null` and persists it to localStorage as `ambo-current-id`
- On mount, `page.tsx` hydrates `currentId` by verifying the stored id still exists for the user; falls back to most-recent; falls back to null (fresh blank draft)
- `app/components/HomilyList.tsx` — drawer overlay, lists all homilies, handles New + Switch + Delete
- `app/components/WriteView.tsx` — takes `currentId`/`onCurrentIdChange`; flushes pending save before swapping
- `app/components/PreachView.tsx` — takes `currentId`; loads from Supabase then falls back to localStorage
- Legacy localStorage key `ambo-draft` still written by Write view as offline cache for the active homily

## Known gotchas
- `@supabase/ssr` cookie handlers need `SetAllCookies` type or TypeScript build fails
- Vercel deployment protection is ON — external curl/fetch can't hit the API
- Universalis returns JSONP — must strip `universalisCallback(` prefix and `);` suffix
- Next.js 16: `middleware.ts` shows deprecation warning (should be `proxy.ts`) — warning only, still works
- `getComingSunday()` is exported from ReadingView and imported by WriteView — keep it there
- GitHub push protection blocks PATs committed to files
- Supabase free tier: ~3 emails/hour rate limit — now bypassed via Resend SMTP
- Vercel production alias vs deployment URLs: the project's real URL is whatever is listed at
  Vercel → Settings → Domains (for amboapp, that is `amboapp.vercel.app`). URLs of the form
  `amboapp-<9char-hash>-beardfish-cos-projects.vercel.app` are single-build snapshots, frozen
  forever — never link or bookmark them.
- Supabase Site URL must always match the production domain. If it drifts to a deployment URL,
  magic links will send users to frozen builds and every 'it's not deploying' symptom will lie.
