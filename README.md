# DRIFT: the daily tilt puzzle

Tilt the board and **every** marble slides at once until it hits something. Sink each marble in the hole of its own colour. A wrong hole or a drain costs a life. You have 3 lives and a move limit, and you earn a ⭐ for matching par.

Static site (HTML + CSS + vanilla JS ES modules). No backend, no build step, no trackers.

```
index.html
css/style.css
js/config.js      ← settings: site URL, launch date, TEST_MODE, lives
js/engine.js      ← pure logic: tilt simulation, BFS solver, generator, difficulty table
js/puzzles.js     ← day number ⇄ date (UTC), loads puzzles.json, getPuzzle()
js/game.js        ← UI, input, animation, results, sharing
js/storage.js     ← versioned localStorage save + migrations
js/audio.js       ← synthesised WebAudio sound effects (no audio files)
puzzles/puzzles.json  ← frozen puzzles (days 1–60) + any hand-made ones
tools/generate.mjs    ← regenerates / verifies puzzles.json
assets/           ← favicon, Open Graph image
```

## Run locally

ES modules and `fetch()` don't work from `file://`, so serve the folder:

```bash
cd drift
python3 -m http.server 8000        # or: npm start
# open http://localhost:8000
```

To test on your phone, use the same Wi-Fi and open `http://<your-PC-IP>:8000`.

### Testing switches

| What | How |
|---|---|
| Unlimited play (default **on**) | `TEST_MODE: true` in `js/config.js`, or `?test=1` / `?test=0` in the URL |
| Play a specific date | `?debug=2026-11-22` (not counted in stats) |
| Reset your save | DevTools → Application → Local Storage → delete `drift.save` |

In test mode you get **◀ / Replay / Random / ▶** under the board and in the results sheet. **Before launch, set `TEST_MODE: false`.** Then the game becomes a real daily: one attempt per UTC day, and a reload shows the finished result instead of a new attempt.

## How the daily mechanic works

- `puzzle number = days since LAUNCH_DATE_UTC + 1`, counted in **UTC**, so everyone in the world is on the same number. The new puzzle drops at 00:00 UTC, which is 02:00 Greek time in winter and 03:00 in summer.
- Puzzle *N* comes from `puzzles/puzzles.json` if it's listed there. Otherwise it's generated from a seed derived from *N*. Both paths are deterministic, so every player gets the same board.
- Difficulty follows the UTC weekday: Mon Breezy → Sun Brutal (more marbles, crates, drains and a higher par; see `DIFFICULTY` in `engine.js`).
- Every generated board is **solved by BFS**, which proves it is solvable and gives the exact par. Boards outside the day's par range are rejected, and so is any board where more than 2% of random swipe sequences win, so mashing doesn't work.
- Your progress is saved after every move. Reloading mid-game restores the board, lives and moves.

## Deploy to GitHub Pages

1. Create a repo (e.g. `drift`) on GitHub.
2. Push this folder's contents to the repo root:
   ```bash
   cd drift
   git init && git add . && git commit -m "DRIFT v1"
   git branch -M main
   git remote add origin https://github.com/VasilisVas1/drift.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, then branch `main`, folder `/ (root)`, and **Save**.
4. After about a minute it's live at `https://vasilisvas1.github.io/drift/`. Because `vasilisvasileiou.com` is set up as the custom domain of your user site, project repos are served under it automatically: **`https://vasilisvasileiou.com/drift/`**.
5. Make sure `SITE_URL` in `js/config.js` and the `og:url` / `og:image` tags in `index.html` point at the live URL. Social sites need **absolute** image URLs.
6. Set `TEST_MODE: false`, then commit and push.

The empty `.nojekyll` file tells Pages to serve the files as-is.

## Adding puzzles

**Option A: let the generator do it (recommended).** Puzzles beyond the JSON file are generated automatically, so you never run out. To *freeze* more days (so later generator tweaks don't change them):

```bash
node tools/generate.mjs 1 365     # freeze a full year
node tools/generate.mjs --check   # verify every puzzle is solvable and its par is correct
```

**Option B: hand-write one.** Add an entry to `puzzles/puzzles.json`:

```json
{ "day": 42, "handmade": true, "rows": [
  "..#....",
  ".R...#.",
  "...x...",
  "#..C..r",
  ".......",
  ".G#....",
  "....g.."
]}
```

Legend: `.` floor · `#` wall · `x` drain · `R G B Y` marbles · `r g b y` holes · `C` crate. Leave out `par` and `limit` and they're computed (limit = par + the day's slack). Run `node tools/generate.mjs --check` to make sure your puzzle is solvable. `handmade: true` protects it from being overwritten.

Changing `LAUNCH_DATE_UTC` shifts which weekday each number falls on, so regenerate the file after changing it.

## Storage & migrations

Everything lives in one localStorage key (`drift.save`) shaped like `{ version, settings, stats, days }`. To change the format later, bump `STORAGE_VERSION` in `config.js` and add a step in `MIGRATIONS` in `storage.js` (e.g. `1: s => { …; s.version = 2; return s; }`).

## Monetization (designed for, not built)

The code is already shaped for paid "extra plays":

- **One entry point for every mode.** `startPuzzle({ mode, n })` in `game.js` plays today (`daily`), any past day (`archive`) or a random seed (`practice`). Test mode already uses the archive and practice paths.
- **One gate.** The `entitlements` object in `game.js` (`canPractice`, `canArchive`) decides access. Today it's just `TEST_MODE`.
- **One placeholder button:** *Archive / Practice — coming soon* in the footer.

### Realistic ways to take payments on a static site

1. **Stripe Payment Links + a tiny serverless function (recommended).**
   - Make a Payment Link in Stripe (one-off "DRIFT Club" unlock, or a subscription). No server is needed to take the money.
   - Set the link's success URL to e.g. `https://vasilisvasileiou.com/drift/?session_id={CHECKOUT_SESSION_ID}`.
   - Write a ~30-line function on **Cloudflare Workers** (generous free tier), **Netlify Functions** or **Vercel Functions**. It receives the `session_id`, asks Stripe whether the session is paid, and returns a **signed token** (e.g. an HMAC or JWT with the email and expiry).
   - The game stores that token in localStorage, and `entitlements` checks it.
   - For restoring purchases on a new device, the function can look the customer up by email and re-issue the token (a magic-link email is the cleanest UX).
2. **Merchant-of-record platforms** (Lemon Squeezy, Paddle, Gumroad). They handle EU VAT for you, which matters when selling from Greece to EU consumers. Their license-key APIs replace the Stripe check above, and you still need a small function to verify keys.
3. **Ko-fi / Buy Me a Coffee "supporter" unlocks.** Least engineering, but verification is manual or webhook-based.

**Be honest about what this protects.** Any check that runs only in the browser can be bypassed: someone can edit localStorage, flip `entitlements` in DevTools, or simply read `engine.js` and generate any puzzle. A signed token stops casual sharing of fake unlocks, but the puzzles themselves are public code. To really gate content, the archive/practice puzzles would have to come **from the serverless function** (only for valid tokens), and the generator would have to be moved off the client. For a small daily game, most successful indies accept the leakage, because people who pay are paying for convenience and to support the game.

## Version 2 ideas

- **Ghost replay:** after finishing, watch the optimal solution (the solver already returns it), unlocked only once you've finished the day.
- **New tiles:** one-way arrows, ice that never stops a marble, portals, switches that toggle walls, colour-changing paint pads. Each one only needs a few lines in `tilt()`, and the solver keeps working unchanged.
- **Undo tokens** (1 per day) as a softer alternative to spending a life.
- **Archive calendar** with ⭐ / ✓ / ✗ per day (the paid feature, built on `startPuzzle`).
- **Weekly "Grand Prix":** the sum of your moves Mon–Sun, shown as a shareable weekly card.
- **Hand-crafted "Sunday Specials"** with a theme (spelled letters, symmetric boards).
- **Friends leaderboard** via a tiny Workers KV store keyed by puzzle number (moves + lives only, no accounts).
- **PWA:** offline support plus "add to home screen", with a service worker caching the static files.
- **Accessibility:** a high-contrast theme and a screen-reader move log (glyphs ● ▲ ■ ◆ already back up colour).
- **Localisation:** a Greek UI toggle.
