import { TILE } from '../tiles.js'
import { createMapData, setTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'spiderweb',
    label: 'Spiderweb',
    description: 'Radial spokes from a central hub crossed by concentric ring corridors',
}

/**
 * A web structure: N spokes radiate from a central hub out to the map edge.
 * Concentric ring corridors cross the spokes at evenly-spaced radii.
 * Ring segments between spokes are individually skippable so the web has
 * gaps and the outer rings feel more partial/torn.
 *
 * complexity 0→1:
 *   spokes           6→16
 *   rings            2→6
 *   spoke width      5→1
 *   ring width       3→1
 *   ring skip       40%→5%  (torn gaps in rings)
 *   hub radius       8→4
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const spokeCount = Math.round(6 + complexity * 10)   // 6→16
    const ringCount = Math.round(2 + complexity * 4)    // 2→6
    const spokeHalf = Math.max(1, Math.round(2 - complexity * 1.5))  // 2→1  (width 5→3)
    const ringHalf = 1                                              // always 3px wide
    const skipChance = 0.40 - complexity * 0.35           // 40%→5%
    const hubR = Math.round(8 - complexity * 4)    // 8→4

    const cx = Math.floor(width / 2)
    const cy = Math.floor(height / 2)

    // Maximum radius: reach to near the map corners
    const maxR = Math.min(cx, cy) * 0.92

    // Spoke start angle — rotate slightly per seed for variety
    const startAngle = rng() * Math.PI * 2

    // ── Hub ───────────────────────────────────────────────────────────────────
    carveDisc(map, cx, cy, hubR)

    // ── Spokes ────────────────────────────────────────────────────────────────
    const spokeAngles = []
    for (let s = 0; s < spokeCount; s++) {
        const angle = startAngle + (s / spokeCount) * Math.PI * 2
        const jitter = (rng() - 0.5) * (Math.PI / spokeCount) * 0.3
        spokeAngles.push(angle + jitter)

        const ex = Math.round(cx + Math.cos(angle + jitter) * maxR)
        const ey = Math.round(cy + Math.sin(angle + jitter) * maxR)
        paintSegment(map, cx, cy, ex, ey, spokeHalf)
    }

    // ── Rings ─────────────────────────────────────────────────────────────────
    for (let ring = 1; ring <= ringCount; ring++) {
        const t = ring / (ringCount + 1)
        // Slightly irregular radius — ovoid, not perfect circle
        const baseR = maxR * (t * 0.85 + 0.08)
        const aspectX = 0.80 + rng() * 0.40   // 0.8→1.2
        const aspectY = 0.80 + rng() * 0.40

        // Carve ring segment between each adjacent spoke pair
        for (let s = 0; s < spokeCount; s++) {
            if (rng() < skipChance) continue  // torn gap in the web

            const a1 = spokeAngles[s]
            const a2 = spokeAngles[(s + 1) % spokeCount]

            // Approximate the arc with short chord segments
            const arcSteps = Math.max(4, Math.round(Math.abs(a2 - a1) * baseR / 3))
            let prev = null
            for (let i = 0; i <= arcSteps; i++) {
                const frac = i / arcSteps
                // Interpolate angle — handle wrap
                let da = a2 - a1
                if (da > Math.PI) da -= Math.PI * 2
                if (da < -Math.PI) da += Math.PI * 2
                const ang = a1 + da * frac

                const px = Math.round(cx + Math.cos(ang) * baseR * aspectX)
                const py = Math.round(cy + Math.sin(ang) * baseR * aspectY)
                if (prev) paintSegment(map, prev.x, prev.y, px, py, ringHalf)
                prev = { x: px, y: py }
            }
        }
    }

    floodKeepLargest(map)
    placeEndpoints(map, rng)
    return map
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
