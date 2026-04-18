@AGENTS.md

# Ambo — Project Memory

## What this is
A sacred writing workspace for Catholic priests. Three modes: Read (liturgical readings), Write (homily editor), Preach (delivery). Commercial side project for Jonathan Stephens (jonathan@beardfish.co). No development budget — Claude builds everything. No AI writing assistance (aligned with Pope Leo XIV's guidance).

## Live URLs
- App: https://amboapp-r7rlzfp1h-beardfish-cos-projects.vercel.app
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
- Save: localStorage immediately + Supabase debounced 1.2s
- Load: Supabase first (most recent homily by updated_at), falls back to localStorage
- `draftIdRef` tracks current Supabase row ID

### Preach view (`app/components/PreachView.tsx`)
- Loads from localStorage only (TODO: also load from Supabase)
- Scroll mode or Step mode (Prev/Next paragraph)
- Adjustable font size (A buttons, 18–36px)

### Database schema
```sql
create table homilies (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
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

## ⚠️ OPEN BUG — ReadingView showing hardcoded placeholder readings

**Symptom:** The app shows the initial hardcoded placeholder readings ("EASTER SEASON", Acts 5:27-32, Psalm 30, John 21:1-14) instead of live Universalis data. The Vercel production deployment IS the latest commit (confirmed via Vercel dashboard). Clearing all site data + incognito mode makes no difference.

**What we know:**
- Universalis API works fine — confirmed with curl, returns correct JSON for both Saturday and Sunday dates
- GitHub has the correct code — confirmed `sundayError` and `showToday` present in ReadingView
- Vercel production deployment hash matches latest GitHub commit (`578101c` → `8f1a0fb`)
- The initial commit (`6a0d3707`) had a hardcoded `getTodayReadings()` function with placeholder readings
- The Universalis ReadingView was added in commit `e54af215`
- Auth IS working (Supabase magic link, Resend SMTP) — so newer code IS running for auth
- The ReadingView the user sees has `season: "Easter Season"` as eyebrow, `day` computed from today's local date — this is exactly the initial hardcoded version
- Changing browser tab title in `layout.tsx` and pushing did NOT change what the user sees — suggests the HTML being served is from an OLD build

**Likely cause:** Next.js 16 may be statically pre-rendering the app shell and caching it at the Vercel CDN edge. Even though the deployment is updated, the pre-rendered HTML might reference old JS chunk hashes. The fix is likely one of:
1. Add `export const dynamic = "force-dynamic"` to `app/page.tsx` to prevent static generation
2. Or purge the Vercel CDN cache manually via Vercel dashboard → Deployments → redeploy with "Clear cache" option checked

**Next step to try:** In Vercel dashboard → Deployments → click the latest deployment → find "Redeploy" → make sure "Use existing build cache" is UNCHECKED → redeploy. This forces a fresh build with no cache.

## Pending work (priority order)
1. **Fix ReadingView bug** (see above) — highest priority
2. **Preach view Supabase sync** — currently reads localStorage only
3. **Multiple homilies** — priests need to manage more than one draft
4. **Custom domain** — still on auto-generated Vercel URL
5. **Writing surface polish** — formatting (bold/italic), paragraph types

## Known gotchas
- `@supabase/ssr` cookie handlers need `SetAllCookies` type or TypeScript build fails
- Vercel deployment protection is ON — external curl/fetch can't hit the API
- Universalis returns JSONP — must strip `universalisCallback(` prefix and `);` suffix
- Next.js 16: `middleware.ts` shows deprecation warning (should be `proxy.ts`) — warning only, still works
- `getComingSunday()` is exported from ReadingView and imported by WriteView — keep it there
- GitHub push protection blocks PATs committed to files
- Supabase free tier: ~3 emails/hour rate limit — now bypassed via Resend SMTP
