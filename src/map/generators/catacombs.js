import { TILE } from '../tiles.js'
import { createMapData, setTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'catacombs',
    label: 'Catacombs',
    description: 'Dendritic tunnels branching outward from a central chamber, like veins or roots',
}

/**
 * A dendritic map: a central chamber radiates N arms outward. Each arm ends
 * in a small chamber, from which further arms branch outward again. The
 * branching repeats for several generations, forming an organic radial network
 * that looks nothing like a grid.
 *
 * complexity 0→1:
 *   branch depth    2→5   (more generations of tunnels)
 *   arms per node   3→6   (wider branching factor, tapers with depth)
 *   arm length     25→10  (shorter arms = denser, more tangled)
 *   corridor width  5→1   (wide navigable halls → tight single-tile shafts)
 *   room radius     6→2   (large vaulted chambers → tiny alcoves)
 *   forward spread ~150°→~180° (children constrained to stay "outward")
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const maxDepth = Math.round(2 + complexity * 3)       // 2→5
    const armCount = Math.round(3 + complexity * 3)       // 3→6
    const armLen = Math.round(25 - complexity * 15)     // 25→10
    const corrHalf = Math.round(2 - complexity * 2)       // 2→0  → street width 5→1
    const roomR = Math.round(6 - complexity * 4)       // 6→2
    const subSpread = Math.PI * (0.83 + complexity * 0.17) // 150°→180° forward cone

    const cx = Math.floor(width / 2)
    const cy = Math.floor(height / 2)

    // Central hub chamber
    carveDisc(map, cx, cy, roomR + 2)

    const params = { armCount, armLen, corrHalf, roomR, subSpread }
    branch(map, cx, cy, 0, 2 * Math.PI, 0, maxDepth, params, rng)

    floodKeepLargest(map)
    placeEndpoints(map, rng)
    return map
}

// ---------------------------------------------------------------------------
// Recursive branching — spawns `n` arms from (x,y) within a forward cone.
// Children keep branching in their own forward cones, tapering in count and
// arm length each generation.
// ---------------------------------------------------------------------------

function branch(map, x, y, incomingAngle, spreadAngle, depth, maxDepth, params, rng) {
    if (depth >= maxDepth) return

    // Arm count tapers with depth so the total stays manageable
    const n = Math.max(2, Math.round(params.armCount * (1 - depth * 0.18)))
    const slice = spreadAngle / n
    const half = spreadAngle / 2

    for (let i = 0; i < n; i++) {
        // Distribute arms evenly across the cone, then jitter each one
        const base = incomingAngle - half + (i + 0.5) * slice
        const jit = (rng() - 0.5) * slice * 0.55
        const angle = base + jit

        // Arms shrink geometrically with depth
        const len = params.armLen * Math.pow(0.76, depth) * (0.7 + rng() * 0.6)

        const nx = Math.round(clamp(x + Math.cos(angle) * len, 6, map.width - 6))
        const ny = Math.round(clamp(y + Math.sin(angle) * len, 6, map.height - 6))

        // Carve the corridor
        paintSegment(map, x, y, nx, ny, params.corrHalf)

        // Carve the end chamber (shrinks with depth)
        const rr = Math.max(1, Math.round(params.roomR * Math.pow(0.82, depth)))
        carveDisc(map, nx, ny, rr)

        // Recurse, continuing roughly in the same direction
        branch(map, nx, ny, angle, params.subSpread, depth + 1, maxDepth, params, rng)
    }
}

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------

function paintSegment(map, x0, y0, x1, y1, half) {
    const dx = x1 - x0
    const dy = y1 - y0
    const steps = Math.max(1, Math.max(Math.abs(dx), Math.abs(dy)))
    for (let i = 0; i <= steps; i++) {
        const t = i / steps
        paintSquare(map, Math.round(x0 + dx * t), Math.round(y0 + dy * t), half)
    }
}

function paintSquare(map, cx, cy, half) {
    for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
            const tx = cx + dx, ty = cy + dy
            if (tx >= 0 && tx < map.width && ty >= 0 && ty < map.height) {
                setTile(map, tx, ty, TILE.OPEN)
            }
        }
    }
}

function carveDisc(map, cx, cy, r) {
    const r2 = r * r
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy <= r2) {
                const tx = cx + dx, ty = cy + dy
                if (tx >= 0 && tx < map.width && ty >= 0 && ty < map.height) {
                    setTile(map, tx, ty, TILE.OPEN)
                }
            }
        }
    }
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v))
}
