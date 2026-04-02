import { TILE } from './tiles.js'
import { findTiles, setTile } from './mapData.js'

// Entrance and exit must be at least this fraction of the shorter map dimension apart.
const MIN_DIST_FRACTION = 0.45

/**
 * Randomly place ENTRANCE and EXIT tiles on two OPEN cells that are
 * sufficiently far apart. Mutates map.tiles, map.entrance, and map.exit.
 *
 * Strategy: collect up to POOL_SIZE qualifying pairs (distance >= minDist),
 * then pick one uniformly at random from that pool. This avoids always
 * converging to the single maximum-distance pair (e.g. fixed corners).
 * Falls back to the best pair found if no qualifying pair is sampled.
 */
export function placeEndpoints(map, rng) {
    const open = findTiles(map, TILE.OPEN)
    if (open.length < 2) {
        throw new Error('Not enough open tiles to place entrance and exit')
    }

    const minDist = Math.min(map.width, map.height) * MIN_DIST_FRACTION
    const POOL_SIZE = 40   // collect this many qualifying candidates, then stop
    const MAX_ATTEMPTS = 600

    // Guaranteed fallback: the furthest-apart pair seen so far
    let bestEntrance = open[0]
    let bestExit = open[open.length - 1]
    let bestDist = euclidean(bestEntrance, bestExit)

    const pool = []  // pairs that meet the minimum distance threshold

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const a = open[Math.floor(rng() * open.length)]
        const b = open[Math.floor(rng() * open.length)]
        if (a === b) continue
        const d = euclidean(a, b)
        if (d > bestDist) {
            bestEntrance = a
            bestExit = b
            bestDist = d
        }
        if (d >= minDist) {
            pool.push([a, b])
            if (pool.length >= POOL_SIZE) break
        }
    }

    // Pick uniformly from qualifying pairs; fall back to the global best
    let entrance, exit_
    if (pool.length > 0) {
        const pick = pool[Math.floor(rng() * pool.length)]
        entrance = pick[0]
        exit_ = pick[1]
    } else {
        entrance = bestEntrance
        exit_ = bestExit
    }

    setTile(map, entrance.x, entrance.y, TILE.ENTRANCE)
    setTile(map, exit_.x, exit_.y, TILE.EXIT)
    map.entrance = entrance
    map.exit = exit_
}

function euclidean(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}
