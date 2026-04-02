import { TILE } from './tiles.js'

// 8-directional neighbours: [dx, dy, cost]
// Cardinal cost 1, diagonal cost √2 ≈ 1.414 (stored ×1000 as integers)
const DIRS = [
    [1, 0, 1000],
    [-1, 0, 1000],
    [0, 1, 1000],
    [0, -1, 1000],
    [1, 1, 1414],
    [-1, 1, 1414],
    [1, -1, 1414],
    [-1, -1, 1414],
]

/**
 * A* shortest-path (8-directional) from `start` to `end` through any non-WALL tile.
 * Heuristic: Chebyshev distance × 1000 (consistent / admissible for mixed step costs).
 *
 * `known` is an optional Uint8Array (same length as map.tiles). When provided,
 * only tiles where known[i] > 0 are considered traversable. Pass null to search
 * the whole map.
 *
 * Returns an array of {x, y} from start (inclusive) to end (inclusive),
 * or null if no path exists.
 */
export function findPath(map, start, end, known = null) {
    const { width, height, tiles } = map
    const n = width * height

    const gCost = new Int32Array(n).fill(2_147_483_647)  // g(n): cost from start
    const parent = new Int32Array(n).fill(-1)
    const closed = new Uint8Array(n)

    const startIdx = start.y * width + start.x
    const goalIdx = end.y * width + end.x

    gCost[startIdx] = 0

    // Minimal binary heap keyed on f = g + h
    const heap = new MinHeap()
    heap.push(startIdx, heuristic(start.x, start.y, end.x, end.y))

    while (!heap.isEmpty()) {
        const cur = heap.pop()
        if (closed[cur]) continue
        closed[cur] = 1
        if (cur === goalIdx) break

        const cx = cur % width
        const cy = (cur - cx) / width

        for (const [ddx, ddy, stepCost] of DIRS) {
            const nx = cx + ddx
            const ny = cy + ddy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const ni = ny * width + nx
            if (closed[ni] || tiles[ni] === TILE.WALL) continue
            if (known && !known[ni]) continue  // fog-of-war: skip unseen tiles

            // For diagonals, both axis-aligned neighbours must also be non-wall
            // (prevents cutting through wall corners)
            if (ddx !== 0 && ddy !== 0) {
                if (tiles[cy * width + nx] === TILE.WALL) continue
                if (tiles[ny * width + cx] === TILE.WALL) continue
            }

            const tentativeG = gCost[cur] + stepCost
            if (tentativeG < gCost[ni]) {
                gCost[ni] = tentativeG
                parent[ni] = cur
                heap.push(ni, tentativeG + heuristic(nx, ny, end.x, end.y))
            }
        }
    }

    if (!closed[goalIdx]) return null  // unreachable

    // Reconstruct path
    const path = []
    let cur = goalIdx
    while (cur !== -1) {
        path.push({ x: cur % width, y: Math.floor(cur / width) })
        cur = parent[cur]
    }
    path.reverse()
    return path
}

// Chebyshev distance × 1000 — consistent heuristic for mixed cardinal/diagonal costs
function heuristic(x0, y0, x1, y1) {
    return Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 1000
}

// ---------------------------------------------------------------------------
// Binary min-heap storing (index, f-score) pairs
// ---------------------------------------------------------------------------
class MinHeap {
    constructor() {
        this._keys = []   // f-scores
        this._vals = []   // node indices
    }

    isEmpty() { return this._keys.length === 0 }

    push(val, key) {
        this._keys.push(key)
        this._vals.push(val)
        this._bubbleUp(this._keys.length - 1)
    }

    pop() {
        const top = this._vals[0]
        const last = this._vals.pop()
        const lk = this._keys.pop()
        if (this._keys.length > 0) {
            this._keys[0] = lk
            this._vals[0] = last
            this._sinkDown(0)
        }
        return top
    }

    _bubbleUp(i) {
        while (i > 0) {
            const p = (i - 1) >> 1
            if (this._keys[p] <= this._keys[i]) break
            this._swap(i, p)
            i = p
        }
    }

    _sinkDown(i) {
        const n = this._keys.length
        while (true) {
            let min = i
            const l = 2 * i + 1, r = 2 * i + 2
            if (l < n && this._keys[l] < this._keys[min]) min = l
            if (r < n && this._keys[r] < this._keys[min]) min = r
            if (min === i) break
            this._swap(i, min)
            i = min
        }
    }

    _swap(a, b) {
        ;[this._keys[a], this._keys[b]] = [this._keys[b], this._keys[a]]
            ;[this._vals[a], this._vals[b]] = [this._vals[b], this._vals[a]]
    }
}
