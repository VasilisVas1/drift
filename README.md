# DRIFT: the tilt puzzle

Tilt the board and **every** marble slides at once until it hits something. Sink each marble in the hole of its own colour. A wrong hole or a drain resets the board. Clear a level to unlock the next one, and go for ★★★.

Static site (HTML + CSS + vanilla JS ES modules). No backend, no build step, no trackers.

```
index.html
css/style.css
js/config.js      ← settings (share URL, puzzle file, save version)
js/engine.js      ← pure logic: tilt simulation, BFS solver, generator, tiers, stars
js/puzzles.js     ← getLevel(n): from puzzles.json, else generated from n
js/game.js        ← UI, input, animation, level flow, level select
js/storage.js     ← versioned localStorage save + migrations
js/audio.js       ← synthesised WebAudio sound effects (no audio files)
puzzles/puzzles.json  ← frozen levels 1–200 (+ any hand-made ones)
tools/generate.mjs    ← regenerates / verifies puzzles.json
assets/           ← favicon, Open Graph image
```

## Rules & scoring

- **Unlimited retries.** Out of moves, a wrong hole or a drain resets the board. **↺ Restart** (or the `R` key) resets it any time.
- **Stars** depend on how many moves your solve took. *Par* is the true minimum, computed by the solver.
  - ★★★ = par
  - ★★ = up to `par + max(1, ⌈0.3·par⌉)`
  - ★ = solved within the move limit `par + max(3, ⌈0.75·par⌉)`
- The star meter in the top-left shows the best you can still get, and it drops a star the moment that's no longer possible.
- **Progression:** clearing level *N* unlocks *N+1*. Your best stars and moves per level are kept, so replay to improve them.
- **Difficulty tiers:** Intro (1–3) → Breezy (4+) → Easy (11+) → Medium (21+) → Tricky (33+) → Hard (46+) → Expert (61+) → Brutal (81+). Every 5th level from 10 on is a **boss**, one tier above its neighbours. Tune this in `TIERS` / `tierForLevel()` in `engine.js`.

## Run locally

```bash
python3 -m http.server 8000      # inside the project folder
# open http://localhost:8000
```

### Dev switches

| What | How |
|---|---|
| Open any level | `?level=37` (also unlocks the ◀ ▶ buttons and the level grid for that visit) |
| Everything unlocked | `?dev=1` |
| Reset progress | DevTools → Application → Local Storage → delete `drift.save` (or use a private tab) |
| Solution for a level | the `solution` field in `puzzles/puzzles.json` (U/D/L/R) |

## Deploy to GitHub Pages

1. Push the folder to a GitHub repo.
2. In the repo, go to **Settings → Pages**, choose **Deploy from a branch**, then `main` and `/ (root)`, and **Save**.
3. It goes live at `https://<account>.github.io/<repo>/` after about a minute.
   **Note:** if that account's user site has a custom domain, GitHub serves every project repo of the account under that domain too. Use a separate account or a free GitHub organization to keep the game off it.
4. Replace `YOUR-SITE-URL` in the `og:` / `twitter:` tags in `index.html` with the live URL, because link previews need absolute URLs.

## Adding levels

Levels past the end of `puzzles.json` are generated from their number, so the game never runs out. Every generated board is solved by BFS, which proves it's solvable and gives the exact par. Boards that random swiping beats more than 3% of the time are rejected.

**Freeze more levels**, so later generator tweaks don't change them and players keep their stars:
```bash
node tools/generate.mjs 1 500
node tools/generate.mjs --check     # verifies every level is solvable and par is right
```

**Hand-write a level.** Add an entry to `puzzles/puzzles.json`:
```json
{ "level": 42, "handmade": true, "rows": [
  "..#....",
  ".R...#.",
  "...x...",
  "#..C..r",
  ".......",
  ".G#....",
  "....g.."
]}
```
Legend: `.` floor · `#` wall · `x` drain · `R G B Y` marbles · `r g b y` holes · `C` crate. Leave out `par` / `limit` and they're computed. `handmade: true` protects the level from regeneration.

## Save format

One localStorage key, `drift.save`: `{ version: 2, settings, progress: { unlocked, current, levels: { n: { stars, best } } }, inProgress }`. To change it, bump `STORAGE_VERSION` in `config.js` and add a step to `MIGRATIONS` in `storage.js`. The v1 → v2 step (daily version → levels) is already there as an example.

## Monetization ideas (not built)

`startLevel(n)` is the single entry point and `canPlay(n)` the single gate in `game.js`, so paid extras slot in easily: hint/solution reveal (the solver already has it), level skips, or premium hand-made packs.

For payments on a static site, the realistic options are **Stripe Payment Links + a small serverless function** (Cloudflare Workers / Netlify / Vercel) that verifies the purchase and returns a signed token, or a merchant-of-record like **Lemon Squeezy / Paddle**, which handle EU VAT. Any check that runs only in the browser can be bypassed: the generator is public code, so really gating content means serving it from the server.

## Version 2 ideas

- **Hint button:** shows the next optimal move (from `solve()` on the current state).
- **New tiles:** one-way arrows, ice, portals, switches that toggle walls, paint pads that recolour marbles. Each is a few lines in `tilt()`, and the solver keeps working unchanged.
- **Undo** (limited, e.g. 3 per level, or costs a star).
- **Worlds:** group levels in sets of 20, each with a new tile type and colour theme, plus star gates (e.g. 40★ to open world 3).
- **Daily challenge** as a side mode (the daily code from v1 is in git history).
- **PWA** for offline play and add-to-home-screen.
- **Greek UI** toggle.
