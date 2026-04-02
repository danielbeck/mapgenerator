import { TILE } from '../tiles.js'
import { createMapData, setTile } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'labyrinth',
    label: 'Labyrinth',
    description: 'A labyrinth of straight branching corridors',
}

/**
 * Uses an iterative recursive-backtracker (DFS) on a regular cell grid.
 * Each pair of adjacent visited cells is connected by a straight carved
 * corridor, giving a perfect maze (no loops, all cells reachable).
 * Extra random connections are added at higher complexity for loops.
 *
 * complexity 0→1:
 *   cell spacing  8→3  (finer grid = more corridors)
 *   corridor width 3→1 (wider at low end, single-tile at high end)
 *   extra loops    0→~15% of cells get an extra connection
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const step = Math.round(20 - complexity * 17)  // 20→3
    const corrW = Math.round(7 - complexity * 6)   // 7→1
    const margin = Math.ceil(corrW / 2) + 2

    const cols = Math.max(2, Math.floor((width - 2 * margin) / step))
    const rows = Math.max(2, Math.floor((height - 2 * margin) / step))

    // Centre the grid inside the map
    const xOff = Math.floor((width - (cols - 1) * step) / 2)
    const yOff = Math.floor((height - (rows - 1) * step) / 2)
    const cellX = (c) => xOff + c * step
    const cellY = (r) => yOff + r * step

    carveLabyrinth(map, cols, rows, cellX, cellY, step, corrW, rng)

    // Extra random connections to add loops (more at high complexity)
    const extraCount = Math.floor(complexity * cols * rows * 0.15)
    for (let i = 0; i < extraCount; i++) {
        if (rng() < 0.5) {
            const c = Math.floor(rng() * (cols - 1))
            const r = Math.floor(rng() * rows)
            carveH(map, cellY(r), cellX(c), cellX(c + 1), corrW)
        } else {
            const c = Math.floor(rng() * cols)
            const r = Math.floor(rng() * (rows - 1))
            carveV(map, cellX(c), cellY(r), cellY(r + 1), corrW)
        }
    }

    placeEndpoints(map, rng)
    return map
}

// ---------------------------------------------------------------------------
// Iterative DFS recursive-backtracker maze
// ---------------------------------------------------------------------------

const DIRS = [
    { dc: 0, dr: -1 },
    { dc: 0, dr: 1 },
    { dc: -1, dr: 0 },
    { dc: 1, dr: 0 },
]

function carveLabyrinth(map, cols, rows, cellX, cellY, step, corrW, rng) {
    const visited = new Uint8Array(cols * rows)
    const idx = (c, r) => r * cols + c

    const startC = Math.floor(rng() * cols)
    const startR = Math.floor(rng() * rows)
    visited[idx(startC, startR)] = 1
    paintNode(map, cellX(startC), cellY(startR), corrW)

    const stack = [{ c: startC, r: startR }]

    while (stack.length) {
        const { c, r } = stack[stack.length - 1]

        // Collect unvisited neighbours in a shuffled order
        const shuffled = shuffleDirs(DIRS, rng)
        let moved = false

        for (const { dc, dr } of shuffled) {
            const nc = c + dc
            const nr = r + dr
            if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
            if (visited[idx(nc, nr)]) continue

            visited[idx(nc, nr)] = 1

            // Carve the corridor between the two cell centres
            if (dc !== 0) {
                carveH(map, cellY(r), cellX(c), cellX(nc), corrW)
            } else {
                carveV(map, cellX(c), cellY(r), cellY(nr), corrW)
            }
            paintNode(map, cellX(nc), cellY(nr), corrW)

            stack.push({ c: nc, r: nr })
            moved = true
            break
        }

        if (!moved) stack.pop()
    }
}

function shuffleDirs(dirs, rng) {
    const arr = [...dirs]
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
            ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
}

// ---------------------------------------------------------------------------
// Carving helpers
// ---------------------------------------------------------------------------

function paintNode(map, x, y, width) {
    const half = Math.floor(width / 2)
    for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
            const tx = x + dx, ty = y + dy
            if (tx >= 0 && tx < map.width && ty >= 0 && ty < map.height) {
                setTile(map, tx, ty, TILE.OPEN)
            }
        }
    }
}

function carveH(map, y, x1, x2, width = 1) {
    const [lo, hi] = x1 < x2 ? [x1, x2] : [x2, x1]
    const half = Math.floor(width / 2)
    for (let x = lo; x <= hi; x++) {
        for (let o = -half; o <= half; o++) {
            const ty = y + o
            if (x >= 0 && x < map.width && ty >= 0 && ty < map.height) {
                setTile(map, x, ty, TILE.OPEN)
            }
        }
    }
}

function carveV(map, x, y1, y2, width = 1) {
    const [lo, hi] = y1 < y2 ? [y1, y2] : [y2, y1]
    const half = Math.floor(width / 2)
    for (let y = lo; y <= hi; y++) {
        for (let o = -half; o <= half; o++) {
            const tx = x + o
            if (tx >= 0 && tx < map.width && y >= 0 && y < map.height) {
                setTile(map, tx, y, TILE.OPEN)
            }
        }
    }
}
