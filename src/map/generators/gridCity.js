import { TILE } from '../tiles.js'
import { createMapData, setTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'city-streets',
    label: 'City Streets',
    description: 'A city grid of regular blocks — possibly rotated, with plazas and the occasional diagonal alley',
}

/**
 * A regular intersection grid, rendered in a rotated coordinate frame so
 * the whole city sits at an angle on the map (angle randomised per seed).
 * Streets run between every adjacent pair of intersections in the grid;
 * some interior ones are skipped (missing streets / dead-ends).
 * Wide boulevards mark every Nth row/column (avenues). Plazas at some
 * intersections. Diagonal alleys at higher complexity.
 *
 * complexity 0→1:
 *   grid cols/rows    4→10   (small town → dense metropolis)
 *   block size       20→10   (wide blocks → narrow blocks)
 *   street width      5→2
 *   avenue spacing    3→2    every Nth row/col is a boulevard
 *   skip chance      30%→5%  (many missing streets → almost all present)
 *   diagonal alleys   0→40%  chance per interior block diagonal
 *   plaza chance     40%→15% (open squares → dense built-up)
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    // Grid parameters
    const cols = Math.round(4 + complexity * 6)       // 4→10
    const rows = Math.round(4 + complexity * 6)       // 4→10
    const blockSize = Math.round(20 - complexity * 10)     // 20→10
    const streetW = Math.round(5 - complexity * 3)       // 5→2
    const avenueEvery = Math.round(3 - complexity)          // 3→2
    const skipChance = 0.30 - complexity * 0.25            // 30%→5%
    const diagChance = complexity * 0.40                   // 0→40%
    const plazaChance = 0.40 - complexity * 0.25            // 40%→15%

    // Rotation: 0° at low complexity (almost axis-aligned),
    // up to ~40° at any complexity so the grid always looks rotated.
    // We pick a fixed angle from the seed so it's reproducible.
    const rotAngle = (rng() * 0.70 - 0.35) + (rng() > 0.5 ? Math.PI / 4 : 0)
    //   ↑ base ±20°                           ↑ 50% chance of an extra 45° snap

    const cosA = Math.cos(rotAngle)
    const sinA = Math.sin(rotAngle)

    // Map centre
    const mx = width / 2
    const my = height / 2

    // Build intersection node grid in rotated space.
    // Grid is centred on the map centre; block size determines spacing.
    const gridW = (cols - 1) * blockSize
    const gridH = (rows - 1) * blockSize

    const nodes = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
            // Local (rotated) coordinates, centred at 0,0
            const lx = -gridW / 2 + c * blockSize
            const ly = -gridH / 2 + r * blockSize

            // Small per-interior-node jitter (not edges) to break mechanical feel
            const isEdge = c === 0 || c === cols - 1 || r === 0 || r === rows - 1
            const jx = isEdge ? 0 : (rng() - 0.5) * blockSize * 0.18
            const jy = isEdge ? 0 : (rng() - 0.5) * blockSize * 0.18

            // Rotate back to world space
            const wx = lx + jx, wy = ly + jy
            return {
                x: Math.round(mx + wx * cosA - wy * sinA),
                y: Math.round(my + wx * sinA + wy * cosA),
            }
        })
    )

    // ── Horizontal streets (connect adjacent columns within each row) ─────────
    for (let r = 0; r < rows; r++) {
        const isAvenueRow = r % avenueEvery === 0
        for (let c = 0; c < cols - 1; c++) {
            const isEdgeRow = r === 0 || r === rows - 1
            if (!isEdgeRow && !isAvenueRow && rng() < skipChance) continue
            const w = isAvenueRow ? Math.min(streetW + 2, 7) : streetW
            carveStraight(map, nodes[r][c], nodes[r][c + 1], w)
        }
    }

    // ── Vertical streets (connect adjacent rows within each column) ───────────
    for (let c = 0; c < cols; c++) {
        const isAvenueCol = c % avenueEvery === 0
        for (let r = 0; r < rows - 1; r++) {
            const isEdgeCol = c === 0 || c === cols - 1
            if (!isEdgeCol && !isAvenueCol && rng() < skipChance) continue
            const w = isAvenueCol ? Math.min(streetW + 2, 7) : streetW
            carveStraight(map, nodes[r][c], nodes[r + 1][c], w)
        }
    }

    // ── Diagonal alleys (across block corners at higher complexity) ───────────
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            if (rng() < diagChance) {
                carveStraight(map, nodes[r][c], nodes[r + 1][c + 1], Math.max(1, streetW - 1))
            }
            if (rng() < diagChance * 0.5) {
                carveStraight(map, nodes[r][c + 1], nodes[r + 1][c], Math.max(1, streetW - 1))
            }
        }
    }

    // ── Plazas at some intersections ──────────────────────────────────────────
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (rng() < plazaChance) {
                const pr = Math.round(2 + rng() * (5 - complexity * 3))
                carveDisc(map, nodes[r][c].x, nodes[r][c].y, pr)
            }
        }
    }

    floodKeepLargest(map)
    placeEndpoints(map, rng)
    return map
}

// ---------------------------------------------------------------------------
// Solid straight segment from a→b with a square brush of given half-width.
// ---------------------------------------------------------------------------

function carveStraight(map, a, b, width) {
    const half = Math.floor(width / 2)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const steps = Math.max(1, Math.max(Math.abs(dx), Math.abs(dy)))
    for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const cx = Math.round(a.x + dx * t)
        const cy = Math.round(a.y + dy * t)
        for (let oy = -half; oy <= half; oy++) {
            for (let ox = -half; ox <= half; ox++) {
                const tx = cx + ox, ty = cy + oy
                if (tx >= 0 && tx < map.width && ty >= 0 && ty < map.height) {
                    setTile(map, tx, ty, TILE.OPEN)
                }
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
