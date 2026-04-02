import { TILE } from '../tiles.js'
import { createMapData, setTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'village',
    label: 'Village',
    description: 'Winding lanes and market squares of an organically-grown settlement',
}

/**
 * City layout:
 *   1. Scatter hub "landmark" nodes across the map.
 *   2. Connect them with a MST (+optional extras) → wide main thoroughfares.
 *   3. For each thoroughfare, fill the band with a local secondary-street grid:
 *        * parallel streets on each side (none at low complexity)
 *        * cross-streets connecting them (fewer and skippable at low complexity)
 *   4. Plaza disc at every hub, smaller ones at some cross-street junctions.
 *   5. Diagonal alley shortcuts between some hub pairs (high complexity only).
 *
 * complexity 0→1:
 *   hub count         3→5   (more districts)
 *   main width        5→2   (narrower at high)
 *   secondary width   3→1
 *   parallel lanes    0→3   per side (none at low complexity)
 *   cross-streets     1→12  per thoroughfare
 *   lane spacing     20→8   tiles apart (wider at low = more open blocks)
 *   skip chance      40%→0% (gaps in streets more common at low complexity)
 *   diagonal alleys   0→35% chance per hub pair
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const margin = 10
    const hubCount = Math.round(3 + complexity * 2)              // 3→5
    const mainWidth = Math.round(5 - complexity * 3)              // 5→2
    const secWidth = Math.max(1, Math.round(3 - complexity * 2)) // 3→1
    const parallelPerSide = Math.round(complexity * 3)                  // 0→3
    const crossCount = Math.round(1 + complexity * 11)            // 1→12
    const spacing = Math.round(20 - complexity * 12)           // 20→8
    const skipChance = (1 - complexity) * 0.4                     // 40%→0%
    const diagChance = complexity * 0.35                          // 0→35%

    // 1. Place landmark hubs (one per zone, strongly randomised)
    const hubs = placeHubs(width, height, margin, hubCount, rng)

    // 2. Build main street graph (MST ensures full connectivity)
    const mainEdges = buildStreetGraph(hubs, rng, complexity)

    // 3. Carve each district: thoroughfare + local secondary-street grid
    for (const [i, j] of mainEdges) {
        carveDistrict(
            map, hubs[i], hubs[j],
            mainWidth, secWidth, parallelPerSide, crossCount, spacing, skipChance, rng,
        )
    }

    // 4. Diagonal alley shortcuts between non-MST hub pairs (high complexity)
    for (let i = 0; i < hubs.length; i++) {
        for (let j = i + 1; j < hubs.length; j++) {
            if (mainEdges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue
            if (rng() < diagChance * 0.4) {
                carveWinding(map, hubs[i], hubs[j], Math.max(1, mainWidth - 2), rng, 0.12)
            }
        }
    }

    // 5. Plaza at every hub
    for (const hub of hubs) {
        const pr = Math.round(3 + rng() * (6 - complexity * 3))
        carveDisc(map, hub.x, hub.y, pr)
    }

    floodKeepLargest(map)
    placeEndpoints(map, rng)
    return map
}

// ---------------------------------------------------------------------------
// Hub placement: one per zone in a randomised grid, then shuffled.
// ---------------------------------------------------------------------------

function placeHubs(width, height, margin, count, rng) {
    const usableW = width - 2 * margin
    const usableH = height - 2 * margin
    const aspect = usableW / usableH
    const gridCols = Math.max(2, Math.round(Math.sqrt(count * aspect)))
    const gridRows = Math.max(2, Math.ceil(count / gridCols))
    const zoneW = usableW / gridCols
    const zoneH = usableH / gridRows

    const candidates = []
    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            const x = margin + (c + 0.15 + rng() * 0.70) * zoneW
            const y = margin + (r + 0.15 + rng() * 0.70) * zoneH
            candidates.push({
                x: Math.round(clamp(x, margin, width - margin)),
                y: Math.round(clamp(y, margin, height - margin)),
            })
        }
    }
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
            ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }
    return candidates.slice(0, count)
}

// ---------------------------------------------------------------------------
// Street graph: Prim's MST + optional shortcut edges.
// ---------------------------------------------------------------------------

function buildStreetGraph(hubs, rng, complexity) {
    const n = hubs.length
    const edges = []
    const connected = new Set([0])

    while (connected.size < n) {
        let bestDist = Infinity, bestI = -1, bestJ = -1
        for (const i of connected) {
            for (let j = 0; j < n; j++) {
                if (connected.has(j)) continue
                const d = hubDist(hubs[i], hubs[j])
                if (d < bestDist) { bestDist = d; bestI = i; bestJ = j }
            }
        }
        connected.add(bestJ)
        edges.push([bestI, bestJ])
    }

    // Extra cross-connections at higher complexity
    const extras = Math.floor(complexity * n * 0.5)
    for (let e = 0; e < extras; e++) {
        const i = Math.floor(rng() * n)
        const j = Math.floor(rng() * n)
        if (i !== j && !edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) {
            edges.push([i, j])
        }
    }
    return edges
}

function hubDist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

// ---------------------------------------------------------------------------
// District: main thoroughfare A→B + local secondary-street grid oriented
// along the thoroughfare axis (parallel lanes + perpendicular cross-streets).
// ---------------------------------------------------------------------------

function carveDistrict(map, a, b, mainW, secW, parallelPerSide, crossCount, spacing, skipChance, rng) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 6) return

    const ux = dx / len   // unit along thoroughfare
    const uy = dy / len
    const vx = -uy        // unit perpendicular (left of A→B)
    const vy = ux

    // Main thoroughfare (always carved)
    carveWinding(map, a, b, mainW, rng, 0.05)

    // Parallel secondary streets on each side — skip some lanes
    for (let side = -1; side <= 1; side += 2) {
        for (let p = 1; p <= parallelPerSide; p++) {
            if (rng() < skipChance) continue
            const offset = p * spacing * side
            const inset = Math.min(len * 0.08, 8)
            const pa = { x: a.x + ux * inset + vx * offset, y: a.y + uy * inset + vy * offset }
            const pb = { x: b.x - ux * inset + vx * offset, y: b.y - uy * inset + vy * offset }
            carveWinding(map, pa, pb, Math.max(1, secW - p + 1), rng, 0.07)
        }
    }

    // Cross-streets — extend at least 1 spacing even when parallelPerSide is 0
    const maxPerp = spacing * Math.max(1, parallelPerSide)
    const step = len / (crossCount + 1)
    for (let c = 1; c <= crossCount; c++) {
        if (rng() < skipChance * 0.6) continue
        const t = c / (crossCount + 1)
        const jx = (rng() - 0.5) * step * 0.3
        const jy = (rng() - 0.5) * step * 0.3
        const cx = a.x + dx * t + jx
        const cy = a.y + dy * t + jy
        carveWinding(map, { x: cx - vx * maxPerp, y: cy - vy * maxPerp },
            { x: cx + vx * maxPerp, y: cy + vy * maxPerp },
            Math.max(1, secW - 1), rng, 0.08)
        // Small plaza at some cross-street junctions
        if (rng() < 0.25) {
            carveDisc(map, Math.round(cx), Math.round(cy), Math.round(2 + rng() * 2))
        }
    }
}

// ---------------------------------------------------------------------------
// Organic street via recursive midpoint displacement.
// At leaf segments, paints a solid filled line from a→b so streets are
// continuous even at 1-tile width.
// ---------------------------------------------------------------------------

function carveWinding(map, a, b, width, rng, jitterFrac, depth = 0) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.sqrt(dx * dx + dy * dy)

    if (len < 4 || depth > 8) {
        paintSegment(map, Math.round(a.x), Math.round(a.y),
            Math.round(b.x), Math.round(b.y), Math.floor(width / 2))
        return
    }

    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const px = -dy / len
    const py = dx / len
    const maxDisp = len * jitterFrac / (1 + depth * 0.4)
    const disp = (rng() * 2 - 1) * maxDisp
    const mid = { x: mx + px * disp, y: my + py * disp }

    carveWinding(map, a, mid, width, rng, jitterFrac, depth + 1)
    carveWinding(map, mid, b, width, rng, jitterFrac, depth + 1)
}

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------

// Trace a solid line from (x0,y0) to (x1,y1), painting a square brush of
// radius `half` at each step — this ensures streets have no gaps.
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
