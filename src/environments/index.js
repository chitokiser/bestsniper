import { MapGenerator } from '../world/MapGenerator.js';
import { MountainMap } from './MountainMap.js';

/**
 * Map registry for SNIPER WEB.
 *
 * `market` is the original Dust Corridor district and stays the default, so
 * the original test suite keeps exercising exactly what it always did. New
 * battlefields are opt-in through `?map=<id>` or the `map` setting.
 */
export const MAPS = {
  market: {
    title: ['Contact expected', 'Suq Al-Rimal — 13:40'],
    assets: [],
    create: (seed) => new MapGenerator(seed)
  },
  mountain: {
    title: ['Mountain Watch', 'Outpost Kestrel — 06:10'],
    assets: ['lantern'],
    create: (seed, opts) => new MountainMap(seed, opts)
  }
};

export const DEFAULT_MAP = 'market';

/** The map this page load should build: URL first, then the saved setting. */
export function resolveMapId(search = typeof location !== 'undefined' ? location.search : '', saved = null) {
  const q = new URLSearchParams(search).get('map');
  if (q && MAPS[q]) return q;
  if (saved && MAPS[saved]) return saved;
  return DEFAULT_MAP;
}
