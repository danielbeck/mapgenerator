import { TILE } from '../tiles.js'
import { createMapData, setTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'river-delta',
    label: 'River Delta',
    description: 'Branching waterways winding through solid ground, creating navigable islands',
}

/**
 * 1–3 source rivers enter from the top of the map and flow downward,
 * bifurcating repeatedly until they reach the bottom. The walkable space
 * IS the water — rivers are open, ground between them is wall.
 *
 * Each river segment meanders slightly before bifurcating. Wider near source,
 * narrows with each bifurcation.
 *
 * complexity 0→1:
 *   source rivers     1→3
 *   bifurcation depth 2→5   (few wide channels → many narrow streams)
 *   river width       7→2
 *   meander amount    low→high
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const sourceCount = Math.round(1 + complexity * 2)   // 1→3
    const maxDepth = Math.round(2 + complexity * 3)   // 2→5
    const rootWidth = Math.round(7 - complexity * 3)   // 7→4  (never below half=2)
    const meander = 0.04 + complexity * 0.14         // 4%→18% lateral jitter

    // Start positions spaced evenly along the top margin
    for (let s = 0; s < sourceCount; s++) {
        const t = sourceCount === 1 ? 0.5 : 0.15 + (s / (sourceCount - 1)) * 0.70
        const sx = Math.round(width * t)
        const sy = 4
        flowRiver(map, sx, sy, 'down', rootWidth, meander, 0, maxDepth, rng)
    }

    floodKeepLargest(map)
    placeEndpoints(map, rng)
    return map
}

// ---------------------------------------------------------------------------
// Recursively flow a river segment in a given cardinal direction, then
// bifurcate into two child rivers at the end.
// ---------------------------------------------------------------------------

function flowRiver(map, startX, startY, dir, width, meander, depth, maxDepth, rng) {
    const half = Math.floor(width / 2)

    // Length of this segment — shorter at deeper levels
    const segLen = Math.round((60 - depth * 8) * (0.7 + rng() * 0.6))

    // Walk the segment with slight meandering
    const isVertical = dir === 'down' || dir === 'up'
    const sign = (dir === 'down' || dir === 'right') ? 1 : -1

    let cx = startX, cy = startY

    for (let i = 0; i < segLen; i++) {
        // Clamp inside map
        cx = clamp(cx, half + 1, map.width - half - 2)
        cy = clamp(cy, half + 1, map.height - half - 2)
        paintSquare(map, cx, cy, half)

        // Advance one step in primary direction + lateral drift
        const drift = Math.round((rng() - 0.5) * meander * segLen * 2)
        if (isVertical) {
            cy += sign
            cx = clamp(cx + (i % 3 === 0 ? drift : 0), half + 1, map.width - half - 2)
        } else {
            cx += sign
            cy = clamp(cy + (i % 3 === 0 ? drift : 0), half + 1, map.height - half - 2)
        }
    }

    if (depth >= maxDepth) return
    if (cx < 1 || cx >= map.width - 1 || cy < 1 || cy >= map.height - 1) return

    const childWidth = Math.max(2, width - 1)   // floor at 2 so half≥1 always

    // Bifurcate: one child continues roughly forward, one diverges
    const divergeAngle = (rng() > 0.5 ? 1 : -1) * (0.3 + rng() * 0.5)
    const dirs = childDirs(dir, divergeAngle)

    flowRiver(map, cx, cy, dirs[0], childWidth, meander, depth + 1, maxDepth, rng)
    flowRiver(map, cx, cy, dirs[1], childWidth, meander, depth + 1, maxDepth, rng)
}

// Return [forward dir, diverged dir] given incoming dir and a diverge angle.
// Simplifies angle to nearest cardinal.
function childDirs(dir, divergeAngle) {
    const cardinals = ['right', 'down', 'left', 'up']
    const idx = cardinals.indexOf(dir)
    const shift = divergeAngle > 0 ? 1 : -1
    const diverged = cardinals[(idx + shift + 4) % 4]
    return [dir, diverged]
}

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------

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

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v))
}
