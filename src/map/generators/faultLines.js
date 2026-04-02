import { TILE } from '../tiles.js'
import { createMapData, setTile, getTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'fault-lines',
    label: 'Fault Lines',
    description: 'Tectonic fissures ripping through rock, widening into caverns where they meet',
}

/**
 * 2–4 stress points each emit primary fault lines outward in all directions.
 * Each fault walks to the map edge with per-segment angular jitter (rough and
 * directional). Where a new fault crosses already-open ground, a pocket cavern
 * erupts at the junction. Secondary hairline cracks branch off primary faults.
 *
 * complexity 0→1:
 *   stress points    2→4
 *   faults/node      3→6
 *   fault half-width 3→0   (wide shafts → single-tile hairline cracks)
 *   cavern radius    6→2   (large pockets → tight junctions)
 *   branch chance   10%→45%
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const stressCount = Math.round(2 + complexity * 2)   // 2→4
    const armsPerStress = Math.round(3 + complexity * 3)   // 3→6
    const faultHalf = Math.round(3 - complexity * 3)   // 3→0
    const cavernR = Math.round(6 - complexity * 4)   // 6→2
    const branchChance = 0.1 + complexity * 0.35          // 10%→45%

    const margin = 18
    const stressPts = Array.from({ length: stressCount }, () => ({
        x: Math.round(margin + rng() * (width - 2 * margin)),
        y: Math.round(margin + rng() * (height - 2 * margin)),
    }))

    for (const sp of stressPts) {
        carveDisc(map, sp.x, sp.y, cavernR + 2)
        for (let a = 0; a < armsPerStress; a++) {
            const baseAngle = (a / armsPerStress) * Math.PI * 2
            const jitter = (rng() - 0.5) * (Math.PI / armsPerStress) * 0.8
            carveFault(map, sp.x, sp.y, baseAngle + jitter,
                faultHalf, cavernR, branchChance, rng, 0)
        }
    }

    floodKeepLargest(map)
    placeEndpoints(map, rng)
    return map
}

// ---------------------------------------------------------------------------
// Walk a fault from (startX,startY) in the given direction until it exits
// the map. Each segment is slightly deflected (±~13°) to produce rough,
// angular cracks rather than perfect straight lines.
// ---------------------------------------------------------------------------

function carveFault(map, startX, startY, angle, half, cavernR, branchChance, rng, depth) {
    const segLen = 13 + rng() * 9
    const maxDist = Math.sqrt(map.width * map.width + map.height * map.height) * 1.25
    const maxSteps = Math.ceil(maxDist / segLen) + 2

    let cx = startX, cy = startY
    let curAngle = angle

    for (let step = 0; step < maxSteps; step++) {
        if (cx < -30 || cx > map.width + 30 || cy < -30 || cy > map.height + 30) break

        curAngle += (rng() - 0.5) * 0.45  // ±~13° angular jitter per segment

        const nx = cx + Math.cos(curAngle) * segLen
        const ny = cy + Math.sin(curAngle) * segLen
        const rx = Math.round(cx)
        const ry = Math.round(cy)

        // Pocket cavern where this fault crosses an already-open channel
        if (rx >= 0 && rx < map.width && ry >= 0 && ry < map.height &&
            getTile(map, rx, ry) === TILE.OPEN) {
            carveDisc(map, rx, ry, cavernR)
        }

        paintSegment(map, rx, ry, Math.round(nx), Math.round(ny), half)

        // Secondary hairline crack branching off at an oblique angle (depth 0 only)
        if (depth === 0 && rng() < branchChance) {
            const sign = rng() > 0.5 ? 1 : -1
            const branchAngle = curAngle + sign * (0.35 + rng() * 0.55)
            const bx = Math.round((cx + nx) / 2)
            const by = Math.round((cy + ny) / 2)
            carveFault(map, bx, by, branchAngle,
                Math.max(0, half - 1), Math.max(1, cavernR - 1),
                branchChance * 0.5, rng, 1)
        }

        cx = nx
        cy = ny
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
