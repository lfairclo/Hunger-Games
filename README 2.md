# The Arena — Tribute Simulator

A from-scratch, fully-automatic tribute survival simulator in the spirit of the
Brantsteele Hunger Games Simulator, rebuilt so that everything is actually
tracked and simulated rather than just slotting names into fixed sentences —
plus a live "watch along" mode powered by Firebase.

There are three pages:

- **`index.html`** — run a game entirely locally, in your own browser. Nothing
  leaves your machine.
- **`host.html`** — identical to `index.html`, but broadcasts the game live to
  Firebase as it plays, so anyone can follow along on `watch.html`.
- **`watch.html`** — a read-only spectator page. Shows the live map, tribute
  roster and stats, and event feed for whatever game `host.html` is currently
  running — from any device, anywhere.

Nobody needs to be clicked through turn by turn (though you can). Once you hit
**Begin the Games**, every tribute scavenges, hunts, forms and breaks
alliances, gets hunted, receives sponsor gifts, and reacts to arena events and
twists entirely on their own, with any number of players.

## What it actually simulates

- **Needs**: health, hunger, thirst, and sanity are tracked per tribute every
  phase. Going without food or water does real, escalating damage.
- **Inventory**: every tribute's items (weapons, tools, food, water,
  medicine) are tracked individually. Food/water/medicine get auto-consumed
  when a tribute needs them; weapons affect combat odds.
- **Locations**: a 12-node arena map (Cornucopia, forests, river, caves,
  ridge, marsh, orchard, lake, cliffs, ruins, meadow). Tributes scavenge,
  hunt, hide, rest, or move between connected locations. What you can find
  depends on where you are.
- **Combat**: resolved from weapon power, traits, numbers, wounds, and
  randomness — not a coin flip. Losing doesn't always mean dying; sometimes
  you just get wounded and escape.
- **Alliances & betrayal**: tributes who cross paths can team up over time.
  Teams can share everything, or a member can quietly keep an item hidden
  from their allies. Betrayal chance rises with scarcity, day count, and
  certain traits (Paranoid, Bloodthirsty) — and drops with others (Loyal).
- **Buffs/debuffs**: each tribute starts with two random traits (Strong,
  Stealthy, Lucky, Cowardly, Sickly, Bloodthirsty, and more) that quietly bend
  the odds on combat, scavenging, alliances, and betrayal.
- **Sponsors**: tributes who fight, survive drama, or otherwise stand out
  build "appeal" and can receive random parachute gifts.
- **Arena events**: feasts, wildfires, floods, muttation attacks, toxic fog,
  gamemaker arena shrinkage, gift surges.
- **Twists**: rarer, escalating events — forced duels, forced alliances,
  weapon drops, gamemakers' mercy, plague, and more.
- **Any number of tributes** — 2 or 200, the engine doesn't care (very large
  counts will just produce a longer feed).
- **Stats page** (Standings tab) — visitable at any time, mid-game or after,
  sortable, click any tribute for their full profile: stats, inventory
  (including what they're hiding from allies), traits, alliance, and personal
  event log.
- **Map tab** — see where every living tribute currently is, and which
  locations are currently on fire, flooded, foggy, or sealed off.
- **Roster export/import** — save your cast (names, portraits, traits) as a
  JSON file and reload it later to replay the exact same group of tributes
  with a new random outcome.

## About the portraits

Tributes automatically get a random portrait pulled from the `avatars`
folder in the `lfairclo/Hunger-Games` GitHub repo, fetched at runtime via
GitHub's public Contents API — no manifest file or build step needed.

- Everything in the `avatars/` folder (this repo ships 16 sample emblems in
  there already) gets pulled in as the portrait pool. Drop your own
  `.png`/`.jpg`/`.jpeg`/`.gif`/`.webp`/`.svg` files in there — real photos,
  fan art, whatever — commit, push, and reload the Setup tab to pick them up.
- New tributes are handed a random image from that pool without repeats
  until it runs out, then it reshuffles.
- **The repo needs to be public** for this to work — the API call is
  unauthenticated and can't see into private repos.
- If the folder is unreachable (offline, empty, renamed, rate-limited, etc.)
  or you click **Use Generated Emblems Instead**, every tribute instead gets
  a unique, deterministic, procedurally generated emblem — no two names look
  alike, and the same name always generates the same one, so there's always
  a sensible fallback.
- You can also click **Upload Photo** next to any individual tribute in Setup
  to give them a specific picture regardless of the pool, or **🖼⟲** to draw a
  fresh one from the pool (or a new generated emblem if there's no pool).
  Either way, it's saved in your roster export so it comes back on import.
- Want a different source repo/folder? Change the `GITHUB_PORTRAIT_SOURCE`
  constant near the top of `main.js`.

## Running it locally

Just open `index.html` in a browser — no build step, no server required. (A
couple of Google Fonts will silently fail to load if you're offline; the
layout falls back gracefully.)

## Watching a game live (Firebase setup)

`host.html` and `watch.html` talk to each other through a free Firebase
Realtime Database. You only need to set this up once:

1. Go to the [Firebase console](https://console.firebase.google.com/) and
   create a new project (the free "Spark" plan is all you need — you can
   skip Google Analytics).
2. In the left sidebar, go to **Build → Realtime Database** and click
   **Create Database**. Pick any location and start in test mode (you'll set
   proper rules next).
3. Go to the **Rules** tab of the Realtime Database and paste this in, then
   publish:
   ```json
   {
     "rules": {
       "games": {
         "current": {
           ".read": true,
           ".write": true
         }
       }
     }
   }
   ```
   This keeps the rest of your database locked down but allows anyone to
   read *and write* to this one game path — there's no login system here, so
   this is what makes both hosting and watching work with zero setup.
   Anyone with your database URL could technically write to this same path;
   that's an acceptable tradeoff for a hobby project, but if it matters to
   you, rename `"current"` to something unguessable (and update
   `ARENA_DB_PATH` in `firebase-config.js` to match), or add Firebase
   Authentication/App Check later.
4. Click the gear icon → **Project settings** → scroll to **Your apps** →
   click the web icon (`</>`) → register an app (any nickname) → you'll be
   shown a `firebaseConfig` object.
5. Open `firebase-config.js` in this project and paste those exact values in,
   replacing the `YOUR_...` placeholders. Pay special attention to
   `databaseURL` — it's specific to the region you picked in step 2.
6. Push everything (including `firebase-config.js`) to your repo and deploy
   as usual.

That's it. Open `host.html` to run a game — the sidebar's "Broadcast"
indicator will say "live" once it's configured and syncing. Open `watch.html`
in any other browser or device to follow along in real time: the map,
tribute roster, live stats, and event feed all update automatically.
`index.html` never touches Firebase at all, so it's still there whenever you
want a fully private, local-only game.

While hosting, there's a **Broadcast Message** box in the Arena tab — type
anything and hit **Send To Watchers** to show it as a banner on everyone's
`watch.html`. Hit **Clear** to remove it. It also clears itself automatically
whenever you start a new game.

If no game has ever been hosted, or the last one ended more than five
minutes ago with nothing new started since, `watch.html` shows "No Game
Active" instead of stale data.

## Deploying to GitHub Pages

1. Create a new **public** repository on GitHub (it needs to be public for
   the automatic portrait-folder feature to work; everything else works fine
   in a private repo, just without that one feature).
2. Add all the files in this folder to the root of the repository and push
   them to your default branch — `index.html`, `host.html`, `watch.html`,
   `style.css`, `data.js`, `engine.js`, `avatars.js`, `main.js`,
   `host-sync.js`, `watch.js`, `firebase-config.js`, `firebase-client.js`,
   and the `avatars/` folder.
3. In the repository, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to "Deploy from a branch",
   pick your default branch and the `/ (root)` folder, then save.
5. GitHub will give you a URL like `https://yourusername.github.io/yourrepo/`
   within a minute or two. `index.html` is your private local simulator,
   `host.html` runs and broadcasts a game, and `watch.html` is what you share
   with people who just want to spectate.

No API keys baked into the site, no custom backend, no build tools — it's a
static site end to end (Firebase is the one external service, and it's free).

## File overview

| File               | Purpose                                                          |
|--------------------|-------------------------------------------------------------------|
| `index.html`       | Local-only simulator — Setup / Arena / Map / Standings tabs.    |
| `host.html`        | Same as above, plus broadcasts the game to Firebase.             |
| `watch.html`       | Read-only live spectator page.                                   |
| `style.css`        | All visual styling, shared by all three pages.                   |
| `data.js`          | Locations, items, traits, and name pools.                        |
| `engine.js`        | The actual simulation: needs, combat, alliances, events, twists. |
| `avatars.js`       | Procedural portrait generator (fallback when GitHub images can't be loaded). |
| `main.js`          | Wires the engine to the page — roster, game loop, rendering. Used by both `index.html` and `host.html`. |
| `host-sync.js`     | Pushes game state to Firebase; wires up the broadcast-message box. `host.html` only. |
| `watch.js`         | Reads game state from Firebase and renders it. `watch.html` only. |
| `firebase-config.js` | Your Firebase project's connection details — edit this one.    |
| `firebase-client.js` | Thin wrapper around the Firebase SDK, shared by `host.html`/`watch.html`. |
| `avatars/`         | Drop portrait images here — see `avatars/README.md`.             |

Feel free to open any of these and tweak the data pools (add your own
locations, items, traits, or arena events) — everything is plain, commented
JavaScript with no build step in the way.
