import { TILE } from '../tiles.js'
import { createMapData, setTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'cave-serpentine',
    label: 'Cave Serpentine',
    description: 'A serpentine of irregular cave-like areas',
}

export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    // complexity 0→1: 4→8 total blobs, radius 14→7, tunnel width 5→2
    const blobCount = Math.round(4 + complexity * 4)
    const blobRadius = Math.round(14 - complexity * 7)
    const tunnelWidth = Math.round(5 - complexity * 3)

    const margin = blobRadius + 4

    // Build a serpentine spine: divide the map into blobCount vertical bands
    // and pick a point inside each one, alternating top/bottom half with jitter.
    // This preserves a general left→right flow while breaking up the grid.
    const waypoints = []
    for (let i = 0; i < blobCount; i++) {
        const t = blobCount === 1 ? 0.5 : i / (blobCount - 1)

        // X: evenly divided band with random offset of up to ±30% of band width
        const bandW = (width - 2 * margin) / blobCount
        const baseX = margin + t * (width - 2 * margin)
        const jitterX = (rng() - 0.5) * bandW * 0.6
        const x = Math.round(Math.min(Math.max(baseX + jitterX, margin), width - margin))

        // Y: alternate between upper and lower halves, with heavy random jitter
        const half = (height - 2 * margin) / 2
        const baseY = i % 2 === 0
            ? margin + rng() * half              // upper half
            : margin + half + rng() * half       // lower half
        const y = Math.round(Math.min(Math.max(baseY, margin), height - margin))

        waypoints.push({ x, y })
    }

    // Carve blobs — each with its own random radius variation
    for (const wp of waypoints) {
        const r = Math.round(blobRadius * (0.7 + rng() * 0.6))
        carveCaveBlob(map, wp.x, wp.y, r, rng)
    }

    // Carve winding cave tunnels between every adjacent pair of waypoints
    for (let i = 0; i + 1 < waypoints.length; i++) {
        carveWindingTunnel(map, waypoints[i], waypoints[i + 1], tunnelWidth, rng)
    }

    // Remove open tiles not connected to the main cave body
    floodKeepLargest(map)

    placeEndpoints(map, rng)
    return map
}

// ---------------------------------------------------------------------------
// Cave blob — circle with a per-blob wobbled radius for an organic outline
// ---------------------------------------------------------------------------

function carveCaveBlob(map, cx, cy, radius, rng) {
    // 12 radial wobble factors sampled once per blob
    const SPOKES = 12
    const spokes = Array.from({ length: SPOKES }, () => 0.65 + rng() * 0.7)

    const bound = radius + 6
    for (let dy = -bound; dy <= bound; dy++) {
        for (let dx = -bound; dx <= bound; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist === 0) {
                safePaint(map, cx, cy)
                continue
            }
            // Interpolate between surrounding spoke values
            const angle = Math.atan2(dy, dx) + Math.PI // 0…2π
            const pos = (angle / (2 * Math.PI)) * SPOKES
            const i0 = Math.floor(pos) % SPOKES
            const i1 = (i0 + 1) % SPOKES
            const frac = pos - Math.floor(pos)
            const wobble = spokes[i0] * (1 - frac) + spokes[i1] * frac
            if (dist <= radius * wobble) {
                safePaint(map, cx + dx, cy + dy)
            }
        }
    }
}

function safePaint(map, x, y) {
    if (x >= 1 && x < map.width - 1 && y >= 1 && y < map.height - 1) {
        setTile(map, x, y, TILE.OPEN)
    }
}

// ---------------------------------------------------------------------------
// Winding cave tunnel via midpoint displacement.
// Recursively splits the segment and displaces each midpoint perpendicular
// to the segment by a random fraction of its length, producing a fractal
// meander. Stops recursing once the segment is short enough, then paints
// a thick oval blob at each leaf point.
// ---------------------------------------------------------------------------

function carveWindingTunnel(map, a, b, width, rng, depth = 0) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.sqrt(dx * dx + dy * dy)

    // Stop recursing when the segment is shorter than ~2 tiles
    if (len < 2.5 || depth > 12) {
        paintBlob(map, Math.round(a.x), Math.round(a.y), width)
        return
    }

    // Midpoint
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2

    // Perpendicular unit vector
    const px = -dy / len
    const py = dx / len

    // Displace: ±25% of the segment length, scaled down with depth so
    // short sub-segments don't displace wildly
    const maxDisp = len * 0.28 / (1 + depth * 0.4)
    const disp = (rng() * 2 - 1) * maxDisp
    const mid = { x: mx + px * disp, y: my + py * disp }

    carveWindingTunnel(map, a, mid, width, rng, depth + 1)
    carveWindingTunnel(map, mid, b, width, rng, depth + 1)
}

function paintBlob(map, cx, cy, radius) {
    const r2 = radius * radius
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy <= r2) {
                safePaint(map, cx + dx, cy + dy)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// (floodKeepLargest is imported from mapData.js)
// ---------------------------------------------------------------------------
