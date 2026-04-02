import { TILE } from '../tiles.js'
import { createMapData, setTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'mineshaft',
    label: 'Mineshaft',
    description: 'Vertical shafts with horizontal adits branching off at each level',
}

/**
 * 1–3 vertical shafts run from near the top to near the bottom of the map.
 * Horizontal adits (side passages) branch off at regular floor intervals.
 * Some adits connect two shafts; some are dead-ends. At higher complexity,
 * more floors and collapsed sections (rubble) appear.
 *
 * complexity 0→1:
 *   shafts           1→3
 *   floors           3→10  (levels between top and bottom)
 *   shaft width      5→2
 *   adit width       3→1
 *   dead-end chance 60%→20%  (adits more likely to connect)
 *   rubble count     0→30
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const shaftCount = Math.round(1 + complexity * 2)     // 1→3
    const floorCount = Math.round(3 + complexity * 7)     // 3→10
    const shaftHalf = Math.round(2 - complexity * 1)     // half → width 5→3
    const aditHalf = Math.max(0, shaftHalf - 1)         // width 3→1
    const deadEndChance = 0.60 - complexity * 0.40         // 60%→20%
    const rubbleCount = Math.round(complexity * 30)

    const margin = 10
    const usableH = height - 2 * margin
    const usableW = width - 2 * margin

    // Shaft X positions — evenly spaced with slight jitter
    const shaftXs = Array.from({ length: shaftCount }, (_, i) => {
        const t = shaftCount === 1 ? 0.5 : (i / (shaftCount - 1)) * 0.7 + 0.15
        const jx = Math.round((rng() - 0.5) * usableW * 0.08)
        return clamp(Math.round(margin + t * usableW) + jx, margin, width - margin)
    })

    // Floor Y positions — evenly spaced with slight jitter
    const floorYs = Array.from({ length: floorCount + 1 }, (_, f) => {
        const t = f / floorCount
        const jy = Math.round((rng() - 0.5) * (usableH / floorCount) * 0.2)
        return clamp(Math.round(margin + t * usableH) + jy, margin, height - margin)
    })

    // ── Vertical shafts ───────────────────────────────────────────────────────
    for (const sx of shaftXs) {
        paintVLine(map, sx, margin, height - margin, shaftHalf)
    }

    // ── Horizontal adits at each floor level ─────────────────────────────────
    for (const fy of floorYs) {
        for (let si = 0; si < shaftXs.length; si++) {
            const sx = shaftXs[si]

            // Decide direction & extent for this adit
            if (shaftCount > 1 && si < shaftXs.length - 1 && rng() > deadEndChance) {
                // Connect to next shaft
                paintHLine(map, sx, shaftXs[si + 1], fy, aditHalf)
            } else {
                // Dead-end adit extending randomly left or right
                const dir = rng() > 0.5 ? 1 : -1
                const length = Math.round(8 + rng() * (usableW * 0.25))
                const endX = clamp(sx + dir * length, margin, width - margin)
                paintHLine(map, Math.min(sx, endX), Math.max(sx, endX), fy, aditHalf)

                // Small chamber at the end of the adit
                carveDisc(map, endX, fy, aditHalf + 2)
            }
        }
    }

    // ── Rubble (collapsed sections blocking some corridors) ───────────────────
    for (let i = 0; i < rubbleCount; i++) {
        const rx = margin + Math.floor(rng() * usableW)
        const ry = margin + Math.floor(rng() * usableH)
        setTile(map, rx, ry, TILE.WALL)
        if (rng() < 0.5) setTile(map, rx + 1, ry, TILE.WALL)
        if (rng() < 0.3) setTile(map, rx, ry + 1, TILE.WALL)
    }

    floodKeepLargest(map)
    placeEndpoints(map, rng)
    return map
}

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------

function paintHLine(map, x0, x1, y, half) {
    for (let x = x0; x <= x1; x++) paintSquare(map, x, y, half)
}

function paintVLine(map, x, y0, y1, half) {
    for (let y = y0; y <= y1; y++) paintSquare(map, x, y, half)
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
