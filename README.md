# The Arena — Tribute Simulator

A from-scratch, fully-automatic tribute survival simulator in the spirit of the
Brantsteele Hunger Games Simulator, rebuilt so that everything is actually
tracked and simulated rather than just slotting names into fixed sentences.

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

The **Portrait Source** panel in Setup can pull random portraits straight
from a folder in this GitHub repo, using GitHub's public Contents API — no
manifest file or build step needed:

- If you're viewing the site on GitHub Pages, it auto-detects your username
  and repository. Otherwise (or to point at a different repo/branch/folder),
  fill in the fields yourself and hit **Load Images From GitHub**.
- Everything in the `avatars/` folder (this repo ships 16 sample emblems in
  there already) gets pulled in as the portrait pool. Drop your own
  `.png`/`.jpg`/`.jpeg`/`.gif`/`.webp`/`.svg` files in there — real photos,
  fan art, whatever — commit, push, and hit **Load Images From GitHub**
  again (or just reload the page) to pick them up.
- New tributes are handed a random image from that pool without repeats
  until it runs out, then it reshuffles.
- **The repo needs to be public** for this to work — the API call is
  unauthenticated and can't see into private repos.
- If no folder is loaded (or the fetch fails, or you click **Use Generated
  Emblems**), every tribute instead gets a unique, deterministic,
  procedurally generated emblem — no two names look alike, and the same name
  always generates the same one, so there's always a sensible fallback.
- You can also click **Upload Photo** next to any individual tribute in Setup
  to give them a specific picture regardless of the pool, or **🖼⟲** to draw a
  fresh one from the pool (or a new generated emblem if there's no pool).
  Either way, it's saved in your roster export so it comes back on import.

## Running it locally

Just open `index.html` in a browser — no build step, no server required. (A
couple of Google Fonts will silently fail to load if you're offline; the
layout falls back gracefully.)

## Deploying to GitHub Pages

1. Create a new **public** repository on GitHub (it needs to be public for
   the automatic portrait-folder feature described below to work; everything
   else works fine in a private repo, just without that one feature).
2. Add all the files in this folder (`index.html`, `style.css`, `data.js`,
   `engine.js`, `avatars.js`, `main.js`, and the `avatars/` folder) to the
   root of the repository and push them to your default branch.
3. In the repository, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to "Deploy from a branch",
   pick your default branch and the `/ (root)` folder, then save.
5. GitHub will give you a URL like `https://yourusername.github.io/yourrepo/`
   within a minute or two — that's your live simulator.

No API keys, no backend, no build tools — it's a static site end to end.

## File overview

| File          | Purpose                                                          |
|---------------|-------------------------------------------------------------------|
| `index.html`  | Page structure — Setup / Arena / Map / Standings tabs.           |
| `style.css`   | All visual styling.                                              |
| `data.js`     | Locations, items, traits, and name pools.                        |
| `engine.js`   | The actual simulation: needs, combat, alliances, events, twists. |
| `avatars.js`  | Procedural portrait generator.                                   |
| `main.js`     | Wires the engine to the page — roster, game loop, rendering.     |
| `avatars/`    | Drop portrait images here — see `avatars/README.md`.             |

Feel free to open any of these and tweak the data pools (add your own
locations, items, traits, or arena events) — everything is plain, commented
JavaScript with no build step in the way.