# Cockroach Action

A small, offline-first site for a local organizing chapter. One shared demand
list that everyone votes on, and one-tap messaging of public authorities.

Live at **https://aytasnerd.github.io/cockroach-action/**

## What's in here

- `index.html` — what this is and how it works.
- `demands.html` — the shared list. Vote, or add a demand for review.
- `act.html` — WhatsApp, email and X templates per demand, plus an RTI
  application generator (letter text only; filing and fees are separate).
- `contacts.html` — a directory rendered from `data/contacts.json`.
- `moderate.html` — organizer sign-in and the review queue.
- `supabase/schema.sql` — the whole database: tables, row-level security,
  and the functions the app calls.
- `.github/workflows/snapshot.yml` — publishes approved demands into
  `data/demands.json`.

## How the pieces fit

There are two stores, and each holds what it is good at holding.

**Supabase** holds live state: votes, proposals, who the moderators are, and
the audit log. It is the only thing that can answer "how many people actually
backed this."

**Git** holds published state. A scheduled Action reads the approved list out
of Supabase and commits it to `data/demands.json`. That committed file is what
every visitor's browser actually reads, served from the GitHub Pages CDN.

That split is deliberate, and it is what makes the site cheap to run under
load: the demand list is a static file on a CDN, so a traffic spike costs the
database nothing. The only per-visitor database call is one indexed query that
patches live vote counts onto the list, and it is skipped entirely when the
visitor is offline. Committing the list also means every change to what the
public sees is a diff you can read, blame, and revert.

### What happens when you vote

1. The number moves immediately, on your phone.
2. `cast_vote()` runs in Postgres. One vote per person per demand is enforced
   by the primary key, so double voting is not expressible, not merely
   discouraged.
3. If you had no signal, the vote is parked in `localStorage` and replayed the
   moment you are back online. If the server refuses it, the optimistic change
   is rolled back rather than leaving a number on screen that isn't true.

### Who can do what

| | Read list | Vote | Propose | Publish / reject |
|---|---|---|---|---|
| Anyone | yes | yes | yes, into a queue | no |
| Organizer | yes | yes | yes | yes |

Voters are anonymous Supabase users — no name, no phone, no signup. Organizers
sign in with a six-digit email code; there are no passwords anywhere.

Proposals can only be created through `propose_demand()`, and the insert policy
on `demands` is `with check (false)`, so the rate limit and the `proposed`
status cannot be bypassed by talking to the API directly.

`voters.verification` exists from day one. Turning on phone verification later
is a config change plus a weighting rule, not a migration, and upgrading an
anonymous user to a phone identity preserves their `auth.uid()` and every vote
they already cast.

## Setup

**1. Create the database.** New Supabase project → SQL Editor → paste
`supabase/schema.sql` → Run.

**2. Seed the list.** SQL Editor → paste `supabase/seed.sql` → Run. This moves
the starting demands into the database. Existing counts land in `offline_votes`,
so a live vote adds to them rather than resetting them.

**3. Turn on anonymous sign-ins.** Authentication → Sign In / Providers →
"Allow anonymous sign-ins". Without this nobody can vote.

**4. Point the site at it.** Fill in `js/config.js` with your Project URL and
the publishable (anon) key from Project Settings → API. That key is meant to be
public; all access control lives in the RLS policies. Never put the
`service_role` / `sb_secret_` key in this file.

**5. Make yourself an organizer.** Open `/moderate.html`, sign in with your
email once so an auth user exists, then run in the SQL editor:

```sql
insert into moderators (id, chapter_id, role)
select u.id, c.id, 'admin'
  from auth.users u, chapters c
 where u.email = 'you@example.com' and c.slug = 'default'
on conflict (id) do update set role = 'admin';
```

**6. Wire up the snapshot.** Add repository secrets `SUPABASE_URL` and
`SUPABASE_SERVICE_KEY` (Settings → Secrets and variables → Actions). The
workflow runs every 15 minutes and refuses to publish an empty list, so a
transient fault can't blank the public demand list.

Until step 4 is done the site runs read-only off the committed snapshot and
says so plainly instead of pretending to record votes.

## Scale

The static parts are effectively free. The limits worth knowing:

- **GitHub Pages** is a soft 100 GB/month. Put Cloudflare in front before that
  becomes real.
- **Supabase free tier** covers 50k monthly active users. Beyond that it's the
  paid tier — the schema doesn't change.
- **Anonymous sign-ups are rate-limited to 30/hour per IP.** This is the one
  that bites in the field: a few hundred people on the same crowded cell tower
  can share an IP, and new devices will be refused while existing ones keep
  working. Sessions persist, so it only affects first-time visitors.

## Editing content

- `data/demands.json` — overwritten by the snapshot workflow once Supabase is
  wired up. Before then, it is the list.
- `data/contacts.json` — grouped contacts. Verify official numbers before a
  mass send; entries in `[brackets]` are placeholders to replace.
- `data/rti-template.json` — the RTI letter. `{{DEMAND_TITLE}}` and
  `{{DEMAND_TEXT}}` are substituted per demand.

Bump `CACHE` in `sw.js` and the `?v=` on asset URLs when you change the shell,
or installed copies will keep serving the old files.

## Look and feel

System fonts, one accent color, thin inline SVG icons, no build step. Colors
and spacing are CSS custom properties in `css/style.css` (`:root` for light,
`[data-theme="dark"]` for dark). Both themes meet WCAG AA for body text, and
`color-scheme` follows the chosen theme so native controls match.

## What this deliberately does not do

- No analytics, no third-party trackers, no ad tech.
- No auto-posting. Every share opens your own WhatsApp, mail, or X composer
  and waits for you to press send.
- No direct RTI e-filing. It prepares the letter text only.
- No collection of names or phone numbers from voters.
