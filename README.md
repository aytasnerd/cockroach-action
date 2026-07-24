# Cockroach Action

A small, static, offline-first, mobile-friendly site for a local organizing
chapter. One shared demand list, a mood check-in, and one-tap messaging of
public authorities. No backend required to run it. No build step to deploy it.

## What's in here

- `index.html`. Overview and how decisions get made.
- `demands.html`. The standardized demand list. Works fully offline
  (localStorage), lets anyone upvote or propose a demand, and a mood check-in.
- `act.html`. One-tap WhatsApp, email, and X templates per demand, plus an
  RTI application generator (letter text only, filing and fees are separate
  offline steps).
- `contacts.html`. A directory rendered from `data/contacts.json`.
- `data/`. The JSON files that hold all the actual content. Edit these, not
  the HTML, to update demands, contacts, or the RTI letter template.
- `sw.js` and `manifest.json`. Make the site an installable offline app (PWA).

## Look and feel

Minimal on purpose. A single monogram mark, thin line icons (inline SVG, no
build tools), one accent color, light and dark themes. Copy is kept short.
Each page leads with one sentence, not a paragraph.

## Is it phone-friendly?

Yes. Built mobile-first and tested at iPhone-size viewports (390px wide)
with no horizontal scroll on any page, touch targets sized for fingers, and
an install prompt available in Chrome and Safari once deployed (thanks to
`manifest.json`).

## Deploy it (pick one, all free)

**GitHub Pages**
1. Push this folder to a GitHub repo.
2. Repo Settings, Pages, Deploy from branch, `main`, `/ (root)`.
3. Your site is live at `https://<username>.github.io/<repo>/`.

**Netlify or Vercel**
- Drag the folder onto [app.netlify.com/drop](https://app.netlify.com/drop), or
  connect the repo in either dashboard. No build command needed.

Note: service workers only run over HTTPS or `localhost`. Any of the above
hosts satisfy that automatically.

## Editing content

Everything an organizer needs to change lives in `data/`.

- `data/demands.json`. The standardized demand list. Each entry has an `id`
  (don't change existing ones once people have voted), a `title`, `text`
  (this becomes the message sent to authorities), and a starting `votes` count.
- `data/contacts.json`. Grouped contact entries. Add your chapter's local MP,
  MLA, or district office. Verify official numbers and emails before a mass send.
- `data/rti-template.json`. The RTI letter skeleton and the filing guidance
  shown on the Take Action page.

These are static JSON files fetched at runtime, so editing them and
redeploying is the entire update process. No rebuild step.

## How offline caching works (there is no sync server)

This is a fully static site. There's no backend, no accounts, and nothing
here tries to merge data across devices over the internet. Syncing just
means the phone catching up with whatever's been published.

1. On first load, with connectivity, the site fetches `data/demands.json`
   once and copies it into the browser's localStorage. From then on, that
   local copy is what the Demands page reads from, so it works instantly
   with zero signal.
2. Votes and new proposals write straight to that local copy and stay on
   that one device. There's no way for this static site to collect them
   from anyone else's phone. The Export button lets someone hand a small
   JSON file of their own activity to an organizer in person.
3. The moment the phone is back online, the site quietly refetches
   `data/demands.json` and refreshes the local copy, so after an organizer
   edits that file and redeploys, every phone that opens the app while
   online picks up the update automatically.
4. The service worker (`sw.js`) caches the app shell and every data file, so
   the whole site, including contacts and the RTI template, keeps working
   with zero signal after the first visit.
5. To force every installed copy to refetch everything, bump the `CACHE`
   version string at the top of `sw.js` (for example `v4` to `v5`).

## The in-person demand round, digitized

The Demands page mirrors how a chapter might already run this at a protest
site. Collect demands for a few hours on a board, tally which ones repeat,
post a leaderboard, then run another round. This is a phone-sized version of
that. Anyone can add a demand or upvote one, on or offline, and organizers
consolidate what came in into an updated `data/demands.json` that every
phone picks up next time it's online. There's no admin account built in. The
count you see is a transparent, locally tallied number, and whether a
proposed demand graduates into the standard list is left to your chapter to
decide.

The mood check-in is a lightweight, per-device pulse check. It doesn't
aggregate across phones. It's just a quick read on how people feel right now.

## Customizing further

- Colors, spacing, and type all live in `css/style.css` as CSS custom
  properties (`:root` for light, `[data-theme="dark"]` for dark).
- Icons are plain inline SVG in each HTML file. Swap the path data to change
  one, no icon font or build step involved.
- Message wording templates are in `js/actions.js` (`messageFor`, `tweetFor`).
- The RTI letter itself is plain text in `data/rti-template.json`.
- Mood check-in words are the `MOOD_WORDS` array at the top of
  `js/demands-page.js`.

## What this deliberately does not do

- No analytics, no third-party trackers, no accounts.
- No server-side sync or merge. Every device's votes and proposals stay
  local until a person exports and hands them off.
- No auto-posting. Every share action opens the native WhatsApp, mail, or X
  composer for a person to review and send.
- No direct RTI e-filing. It prepares the letter text only.
