import { TILE } from '../tiles.js'
import { createMapData, setTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'sewers',
    label: 'Sewers',
    description: 'Strictly axis-aligned pipe corridors connecting circular junction chambers',
}

/**
 * A sewer system: all corridors are exactly horizontal or vertical, all
 * junctions are circular chambers. Two passes of pipes are laid (H first,
 * then V) so they cross-connect. Some runs skip to allow dead-ends.
 *
 * The layout is a sparse grid of junction chambers, connected by pipes.
 * Horizontal and vertical pipes are drawn with different widths to give a
 * sense of "main sewer" vs "side channel."
 *
 * complexity 0→1:
 *   junction grid    3×3→8×8
 *   chamber radius   5→2
 *   main pipe width  5→2
 *   side pipe width  3→1
 *   skip chance     35%→5%
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const gridCols = Math.round(3 + complexity * 5)   // 3→8
    const gridRows = Math.round(3 + complexity * 5)
    const chamberR = Math.round(5 - complexity * 3)   // 5→2
    const mainHalf = Math.round(2 - complexity * 1)   // half → width 5→3
    const sideHalf = Math.max(0, mainHalf - 1)        // width 3→1
    const skipChance = 0.35 - complexity * 0.30         // 35%→5%

    const margin = chamberR + 4
    const cellW = (width - 2 * margin) / (gridCols - 1)
    const cellH = (height - 2 * margin) / (gridRows - 1)

    // Build junction grid with slight jitter on interior nodes
    const nodes = Array.from({ length: gridRows }, (_, r) =>
        Array.from({ length: gridCols }, (_, c) => {
            const bx = Math.round(margin + c * cellW)
            const by = Math.round(margin + r * cellH)
            const edge = c === 0 || c === gridCols - 1 || r === 0 || r === gridRows - 1
            const jx = edge ? 0 : Math.round((rng() - 0.5) * cellW * 0.25)
            const jy = edge ? 0 : Math.round((rng() - 0.5) * cellH * 0.25)
            return { x: bx + jx, y: by + jy }
        })
    )

    // ── Junction chambers ─────────────────────────────────────────────────────
    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            carveDisc(map, nodes[r][c].x, nodes[r][c].y, chamberR)
        }
    }

    // ── Horizontal pipes (main runs) ──────────────────────────────────────────
    for (let r = 0; r < gridRows; r++) {
        const isMain = r % 2 === 0
        const half = isMain ? mainHalf : sideHalf
        for (let c = 0; c < gridCols - 1; c++) {
            if (r !== 0 && r !== gridRows - 1 && rng() < skipChance) continue
            carvePipe(map, nodes[r][c], nodes[r][c + 1], half)
        }
    }

    // ── Vertical pipes (side channels) ────────────────────────────────────────
    for (let c = 0; c < gridCols; c++) {
        const isMain = c % 2 === 0
        const half = isMain ? mainHalf : sideHalf
        for (let r = 0; r < gridRows - 1; r++) {
            if (c !== 0 && c !== gridCols - 1 && rng() < skipChance) continue
            carvePipe(map, nodes[r][c], nodes[r + 1][c], half)
        }
    }

    floodKeepLargest(map)
    placeEndpoints(map, rng)
    return map
}

// ---------------------------------------------------------------------------
// Carve a strictly rectilinear L-shaped pipe from a→b.
// Goes horizontal first, then vertical (or vice-versa 50% of the time)
// for variety — and carves a small disc at the corner bend.
// ---------------------------------------------------------------------------

function carvePipe(map, a, b, half) {
    const goHorizFirst = true  // always H then V so pipes look consistent
    const cx = goHorizFirst ? b.x : a.x
    const cy = goHorizFirst ? a.y : b.y

    // Horizontal leg
    paintHLine(map, Math.min(a.x, cx), Math.max(a.x, cx), a.y, half)
    // Corner disc
    carveDisc(map, cx, cy, half + 1)
    // Vertical leg
    paintVLine(map, cx, Math.min(a.y, b.y), Math.max(a.y, b.y), half)
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
