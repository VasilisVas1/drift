// DRIFT — configuration. Edit this file, not the game logic.
export const CONFIG = {
  // Public URL used in the Share text. Leave empty to use the address the game is opened from.
  SITE_URL: '',

  // Hand-made or frozen levels. Levels not listed there are generated from their number.
  PUZZLE_FILE: 'puzzles/puzzles.json',

  // localStorage key + schema version (bump STORAGE_VERSION and add a migration in storage.js)
  STORAGE_KEY: 'drift.save',
  STORAGE_VERSION: 2,
};
