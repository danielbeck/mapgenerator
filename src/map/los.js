import { TILE } from './tiles.js'

export const VIEW_RADIUS = 30

// Worst-case stack depth: one entry per row per octant.
// Each entry is 3 floats (startRow, startSlope, endSlope).
// VIEW_RADIUS rows × 3 values = 90 floats — allocate once, reuse every call.
const _stack = new Float64Array(VIEW_RADIUS * 3 * 32) // generous headroom

// Octant multiplier tables (constant — allocated once at module load)
const XX = new Int8Array([ 1,  0,  0, -1, -1,  0,  0,  1])
const XY = new Int8Array([ 0,  1,  1,  0,  0, -1, -1,  0])
const YX = new Int8Array([ 0,  1, -1,  0,  0, -1,  1,  0])
const YY = new Int8Array([ 1,  0,  0,  1, -1,  0,  0, -1])

/**
 * Iterative shadowcasting. Writes results into `out` (a Uint8Array the same
 * length as map.tiles). The caller is responsible for zeroing `out` before
 * each call — use `out.fill(0)` or keep a dedicated reusable buffer.
 */
export function computeVisible(map, pos, out) {
    const { width, height, tiles } = map
    const vis = out
    const cx = pos.x, cy = pos.y

    vis[cy * width + cx] = 1

    const R2 = VIEW_RADIUS * VIEW_RADIUS

    for (let oct = 0; oct < 8; oct++) {
        const xx = XX[oct], xy = XY[oct], yx = YX[oct], yy = YY[oct]

        // Flat stack: entries are stored as 3 consecutive floats
        // [startRow, startSlope, endSlope, startRow, ...]
        let sp = 0
        _stack[sp++] = 1; _stack[sp++] = 1.0; _stack[sp++] = 0.0

        while (sp > 0) {
            const endSlope   = _stack[--sp]
            const startSlope = _stack[--sp]
            const startRow   = _stack[--sp]
            if (startSlope < endSlope) continue

            let start = startSlope
            let blocked = false
            let newStart = 0.0

            for (let j = startRow; j <= VIEW_RADIUS; j++) {
                const dy = -j

                for (let dx = -j; dx <= 0; dx++) {
                    const lSlope = (dx - 0.5) / (dy + 0.5)
                    const rSlope = (dx + 0.5) / (dy - 0.5)

                    if (start < rSlope) continue
                    if (endSlope > lSlope) break

                    const wx = cx + dx * xx + dy * yx
                    const wy = cy + dx * xy + dy * yy

                    const inBounds = wx >= 0 && wy >= 0 && wx < width && wy < height
                    const isWall = !inBounds || tiles[wy * width + wx] === TILE.WALL

                    if (inBounds && dx * dx + dy * dy <= R2) {
                        vis[wy * width + wx] = 1
                    }

                    if (blocked) {
                        if (isWall) {
                            newStart = rSlope
                        } else {
                            blocked = false
                            start = newStart
                        }
                    } else if (isWall && j < VIEW_RADIUS) {
                        blocked = true
                        _stack[sp++] = j + 1; _stack[sp++] = start; _stack[sp++] = lSlope
                        newStart = rSlope
                    }
                }

                if (blocked) break
            }
        }
    }
}
