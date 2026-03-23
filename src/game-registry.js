/**
 * Game Registry — Central registration system for all games.
 * 
 * To add a new game, simply call registerGame() with your game config.
 * See src/games/TEMPLATE.js for a complete example.
 * 
 * Required config fields:
 *   - id:          Unique string identifier (used in routing & CSS)
 *   - name:        Display name (Chinese)
 *   - icon:        Emoji icon
 *   - tag:         Category tag (e.g. '社交推理')
 *   - description: Short description for the home page card
 *   - playerRange: e.g. '6-8 人'
 *   - duration:    e.g. '15-30 分钟'
 *   - features:    e.g. '🎭 角色扮演'
 *   - GameClass:   The game class constructor (must accept (container, app))
 */

const registry = new Map();

/**
 * Register a new game. Call this at module level in your game file.
 * @param {Object} config - Game configuration object
 */
export function registerGame(config) {
  const required = ['id', 'name', 'icon', 'tag', 'description', 'playerRange', 'duration', 'features', 'GameClass'];
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`registerGame: missing required field "${key}"`);
    }
  }
  if (registry.has(config.id)) {
    console.warn(`registerGame: overwriting existing game "${config.id}"`);
  }
  registry.set(config.id, { ...config });
}

/** Get a single game config by id */
export function getGame(id) {
  return registry.get(id) || null;
}

/** Get all registered games (in registration order) */
export function getAllGames() {
  return Array.from(registry.values());
}
