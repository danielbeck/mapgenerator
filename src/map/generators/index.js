import { seededRng } from '../rng.js'
import * as openArea from './openArea.js'
import * as roomsAndTunnels from './roomsAndTunnels.js'
import * as caveSerpentine from './caveSerpentine.js'
import * as labyrinth from './labyrinth.js'
import * as arena from './arena.js'
import * as cityStreets from './cityStreets.js'
import * as gridCity from './gridCity.js'
import * as catacombs from './catacombs.js'
import * as faultLines from './faultLines.js'
import * as ruinedHalls from './ruinedHalls.js'
import * as spiderweb from './spiderweb.js'
import * as concentricRings from './concentricRings.js'
import * as riverDelta from './riverDelta.js'
import * as sewers from './sewers.js'
import * as mineshaft from './mineshaft.js'
import * as ancientTemple from './ancientTemple.js'

/**
 * All registered map generators, in display order.
 * To add a new type: import its module and add it to this array.
 */
const REGISTRY = [
    openArea,
    roomsAndTunnels,
    caveSerpentine,
    labyrinth,
    arena,
    cityStreets,
    gridCity,
    catacombs,
    faultLines,
    ruinedHalls,
    spiderweb,
    concentricRings,
    riverDelta,
    sewers,
    mineshaft,
    ancientTemple,
]

/** Metadata for all registered generators (id, label, description). */
export const GENERATOR_META = REGISTRY.map((g) => g.meta)

const byId = Object.fromEntries(REGISTRY.map((g) => [g.meta.id, g.generate]))

/**
 * Generate a map of the given type.
 * @param {string} typeId     - matches a generator's meta.id
 * @param {number} width
 * @param {number} height
 * @param {number} [complexity] - 0 (simple) to 1 (complex), default 0.5
 * @param {number} [seed]     - omit for a random seed
 * @returns {MapData}
 */
export function generateMap(typeId, width, height, complexity = 0.5, seed = Date.now()) {
    const generate = byId[typeId]
    if (!generate) throw new Error(`Unknown map type: "${typeId}"`)
    return generate(width, height, seededRng(seed), complexity)
}
