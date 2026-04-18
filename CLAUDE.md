@AGENTS.md

# Ambo — Project Memory

## What this is
A sacred writing workspace for Catholic priests. Three modes: Read (liturgical readings), Write (homily editor), Preach (delivery). Commercial side project for Jonathan Stephens (jonathan@beardfish.co). No development budget — Claude builds everything.

**Core principle:** No AI writing assistance. Aligned with Pope Leo XIV's guidance to priests.

## Live URLs
- App: https://amboapp-r7rlzfp1h-beardfish-cos-projects.vercel.app
- GitHub: https://github.com/beardfish-co/amboapp
- Supabase: https://jowbavogcjozxpujwwah.supabase.co

## Credentials
- Supabase URL: https://jowbavogcjozxpujwwah.supabase.co (safe to commit — public anon key only)
- GitHub PAT: stored in Jonathan's password manager — generate at github.com/settings/tokens if expired

## Tech stack
- Next.js 16, App Router, TypeScript, Tailwind 4
- Supabase (auth + PostgreSQL with RLS)
- @supabase/ssr for server-side session management
- Vercel (auto-deploy on push to main)
- Universalis API for liturgical readings (JSONP format)

## Design system
- Aesthetic: Apple Glass — cool blue-grey, translucent, minimal
- Background: `#EEF2F7`
- Accent: `#4A6FA5`
- All CSS variables and component classes in `app/globals.css`
- Key classes: `.glass-card`, `.mode-pill`, `.mode-pill-btn`, `.ambo-para-wrapper`, `.ambo-drag-handle`

## Architecture

### Auth flow
- Magic link only (no passwords)
- `app/login/page.tsx` — email input → `supabase.auth.signInWithOtp()`
- `app/auth/callback/route.ts` — exchanges OTP code for session
- `middleware.ts` — gates all routes; unauthenticated → `/login`; `/api` routes excluded from redirect

### Readings (Read view)
- `app/api/readings/route.ts` — proxy to Universalis, strips JSONP, returns clean JSON
  - Universalis endpoint: `https://universalis.com/{YYYYMMDD}/jsonpmass.js`
  - Strips wrapper: `universalisCallback({...});`
  - Fields: `Mass_R1`, `Mass_Ps`, `Mass_R2`, `Mass_G` (Gospel)
  - Caches 1 hour: `next: { revalidate: 3600 }`
- `app/components/ReadingView.tsx` — fetches Sunday + today's readings
  - `getComingSunday()` — returns next Sunday (or today if Sunday); exported for use in WriteView
  - Sunday always shown prominently at top as primary section
  - Today's weekday readings hidden behind a collapsible toggle
  - Error state with Retry button if Sunday fetch fails

### Write view (`app/components/WriteView.tsx`)
- Paragraph-based editor (not a rich text editor)
- Each paragraph is an auto-growing textarea
- Enter = new paragraph, Backspace on empty = delete paragraph
- Drag-to-reorder paragraphs with HTML5 drag API + undo toast
- Title input with Sunday name suggestion (from Universalis dayName)
- Save strategy: localStorage immediately + Supabase debounced 1.2s
- Load strategy: Supabase first (most recent homily), falls back to localStorage
- `draftIdRef` tracks current Supabase row ID (update vs insert)
- Word count + estimated reading time (130 wpm) in fixed status bar

### Preach view (`app/components/PreachView.tsx`)
- Loads content from localStorage (TODO: also load from Supabase)
- Scroll mode (full text) or Step mode (one paragraph at a time, Prev/Next)
- Adjustable font size (A buttons, range 18–36px)

### Database
```sql
-- homilies table with RLS
create table homilies (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default '',
  content text not null default '',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
-- RLS: each priest sees only their own homilies
```

### Supabase clients
- `lib/supabase/client.ts` — browser client (`createBrowserClient`)
- `lib/supabase/server.ts` — server client using Next.js `cookies()`; uses `SetAllCookies` type from `@supabase/ssr`
- `middleware.ts` — uses `createServerClient` + `SetAllCookies` type (required to fix TS errors)

## Pushing to GitHub
Always use this pattern (bash sandbox can't push directly from outputs dir due to git state):
```bash
PAT="<ask Jonathan for current PAT>"
cd /tmp && rm -rf ambo-push-X && mkdir ambo-push-X && cd ambo-push-X
git clone https://$PAT@github.com/beardfish-co/amboapp.git .
git config user.email "jonathan@beardfish.co"
git config user.name "Jonathan Stephens"
# copy changed files from /sessions/clever-funny-ride/mnt/outputs/amboapp/
cp /sessions/clever-funny-ride/mnt/outputs/amboapp/[file] [file]
git add [files]
git commit -m "description"
git push origin main
```

## Pending work (priority order)
1. **Preach view Supabase sync** — currently reads localStorage only; should also try Supabase
2. **Multiple homilies** — priests write a new homily every week; need list/select/new draft UI
3. **Custom domain** — still on auto-generated Vercel URL
4. **Writing surface polish** — Jonathan said "the actual writing area isn't complete yet"; formatting (bold/italic), paragraph types

## Known issues / gotchas
- `@supabase/ssr` cookie handlers require explicit `SetAllCookies` type import or TypeScript fails
- Vercel deployment protection is on — external tools can't hit the API endpoints
- Universalis returns JSONP (not JSON); must strip `universalisCallback(` prefix and `);` suffix
- Next.js 16: `middleware.ts` is deprecated, should be `proxy.ts` (warning only, still works)
- `getComingSunday()` is exported from ReadingView and imported by WriteView — keep it there
- Supabase `Site URL` must be set to Vercel domain, not localhost, for magic links to work
- Redirect URLs in Supabase must include: `https://[vercel-domain]/auth/callback`
