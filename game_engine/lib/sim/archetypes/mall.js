import { Outdoor } from '../engine/world/worlds/Outdoor.js'
import { ShoeShop } from '../engine/world/worlds/ShoeShop.js'
import { ElectronicsShop } from '../engine/world/worlds/ElectronicsShop.js'
import { CafeShop } from '../engine/world/worlds/CafeShop.js'
import { SoleFlagship } from '../engine/world/worlds/SoleFlagship.js'

/**
 * SHOPPING COMPLEX.
 *
 * The ShopVerse plaza and its four interiors, re-dressed for an Indian city.
 *
 * This is the venue the bazaar deliberately is NOT. A bazaar is heaps of goods
 * on trestles under tarpaulin; a complex is glazed shopfronts, a forecourt and
 * air conditioning — and trying to make one shell serve both is what made the
 * first lane read as a mall with no doors. So they are separate archetypes, and
 * a situation compiles into whichever one it actually happens in. "Buy a saree
 * at the mandi" and "exchange a shirt at the mall" should not look alike.
 *
 * Almost all of this is hand-authored ShopVerse work being reused as-is. What
 * is parameterised is what a scenario needs to change: the four shopfront
 * slots, the palette and sky, the greeter and the cast.
 *
 * INTERIORS ARE LAZY
 *
 * Building all five worlds up front was the original startup cost, and four of
 * them are behind doors the player may never open. So the plaza builds, and an
 * interior is constructed the first time someone walks into it — a fraction of
 * a second on entry rather than four seconds before the first frame.
 */

const INTERIORS = {
  sole: SoleFlagship,
  fashion: ShoeShop,
  electronics: ElectronicsShop,
  cafe: CafeShop,
}

/** Tenants that read as an Indian city mall rather than a Californian one. */
export const DEFAULT_MALL_VENUES = [
  { key: 'sole', name: 'Rangoli Sarees', sub: 'silk · handloom' },
  { key: 'fashion', name: 'Bandhan Fashion', sub: 'kurtas · denim' },
  { key: 'electronics', name: 'Sharma Electronics', sub: 'mobiles · repairs' },
  { key: 'cafe', name: 'Irani Cafe', sub: 'chai · bun maska' },
]

/**
 * Builds the complex and returns its plaza.
 *
 * @param {object} game the SimHost
 * @param {{title?: string, theme: object, venues?: Array<object>, greeter?: object, actors?: Array<object>}} spec
 */
export function buildMall(game, spec) {
  const t = spec.theme
  const venues = (spec.venues ?? DEFAULT_MALL_VENUES).slice(0, 4)
  const buildings = t.buildings ?? [0xe8dcc0]
  const canopies = t.canopies ?? [0xd9483b]

  const plaza = new Outdoor(game, {
    title: spec.title ?? 'Shopping complex',
    sky: {
      top: t.sky[0], mid: t.sky[2], bottom: t.sky[4],
      sun: hex(t.sunColour),
      sunDir: [0.5, 0.2, -0.84],
      sunSize: 0.018,
      cloud: '#FFF0DC', cloudAlpha: 0.55, stars: 0,
      fog: hex(t.fog),
    },
    fog: { near: 70, far: 200 },
    hemiSky: hex(t.hemiSky),
    hemiGround: hex(t.hemiGround),
    hemiIntensity: t.hemiIntensity ?? 0.95,
    sunColour: hex(t.sunColour),
    sunIntensity: t.sunIntensity ?? 1.9,
    ground: hex(t.tarmac),
    plaza: hex(t.plaza),
    // The original's neon circles, repainted in the district's canopy colours so
    // they read as forecourt paint rather than a nightclub floor.
    discs: [
      [-9, 18, 4.5, hex(canopies[0])],
      [10, 14, 3.5, hex(canopies[1] ?? canopies[0])],
      [-6, 4, 2.8, hex(canopies[2] ?? canopies[0])],
      [8, 24, 3, hex(t.lane ?? 0xf0e6b8)],
    ],
    venues: venues.map((v, i) => ({
      key: v.key,
      x: [-25, -8.5, 8.5, 25][i] ?? 25,
      name: v.name,
      sub: v.sub ?? '',
      base: hex(buildings[i % buildings.length]),
      accent: hex(canopies[i % canopies.length]),
      glow: '#ffe9b8',
    })),
    ...(spec.greeter ? { greeter: spec.greeter } : {}),
    actors: spec.actors ?? [],
  })

  // The doors call game.switchWorld(key); the host resolves against this.
  game.interiors = { outdoor: plaza }
  game.interiorFactories = {}
  for (const [key, Klass] of Object.entries(INTERIORS)) {
    game.interiorFactories[key] = () => new Klass(game)
  }

  return plaza
}

function hex(n) {
  return typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : n
}
