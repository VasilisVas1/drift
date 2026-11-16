// DRIFT — configuration. Edit this file, not the game logic.
export const CONFIG = {
  // Public URL used in the Share text. Change to wherever you host the game.
  SITE_URL: 'https://vasilisvasileiou.com/drift/',

  // Puzzle #1 is this UTC date. Every UTC midnight the puzzle number goes up by one,
  // so everyone in the world is on the same puzzle number at the same moment.
  LAUNCH_DATE_UTC: '2026-11-16',

  // TEST MODE — unlimited plays for you while developing.
  //   true  → after a game you get Replay / Random puzzle / Prev / Next day buttons.
  //   false → real daily game: one attempt per day, the state locks after you finish.
  // You can also force it per-visit with ?test=1 or ?test=0 in the URL.
  TEST_MODE: true,

  // Lives (full resets of the board) per puzzle.
  LIVES: 3,

  // Hand-made or frozen puzzles. Days not listed there are generated from the seed.
  PUZZLE_FILE: 'puzzles/puzzles.json',

  // localStorage key + schema version (bump STORAGE_VERSION and add a migration in storage.js)
  STORAGE_KEY: 'drift.save',
  STORAGE_VERSION: 1,
};
