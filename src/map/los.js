import { TILE } from './tiles.js'

export const VIEW_RADIUS = 20

/**
 * Iterative recursive shadowcasting (Bjorn Bergstrom / Roguebasin style).
 * Processes 8 octants; each pending sub-scan is pushed onto a stack instead
 * of recursing, avoiding any call-stack limits.
 *
 * Returns a Uint8Array (1=visible, 0=not) the same length as map.tiles.
 */
export function computeVisible(map, pos) {
    const { width, height, tiles } = map
    const vis = new Uint8Array(width * height)
    const cx = pos.x, cy = pos.y

    vis[cy * width + cx] = 1

    // Roguebasin multiplier tables for all 8 octants.
    // Formula: wx = cx + dx*xx + dy*yx,  wy = cy + dx*xy + dy*yy
    // XX = dx factor for world X; YX = dy factor for world X
    // XY = dx factor for world Y; YY = dy factor for world Y
    // Octants:                      0   1   2   3   4   5   6   7
    const XX = [1, 0, 0, -1, -1, 0, 0, 1]
    const XY = [0, 1, 1, 0, 0, -1, -1, 0]
    const YX = [0, 1, -1, 0, 0, -1, 1, 0]
    const YY = [1, 0, 0, 1, -1, 0, 0, -1]

    const R2 = VIEW_RADIUS * VIEW_RADIUS

    for (let oct = 0; oct < 8; oct++) {
        const xx = XX[oct], xy = XY[oct], yx = YX[oct], yy = YY[oct]

        // Stack entries: [startRow, startSlope, endSlope]
        const stack = [[1, 1.0, 0.0]]

        while (stack.length > 0) {
            const [startRow, startSlope, endSlope] = stack.pop()
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
                            newStart = rSlope         // extend the shadow
                        } else {
                            blocked = false          // shadow ended
                            start = newStart
                        }
                    } else if (isWall && j < VIEW_RADIUS) {
                        blocked = true             // new shadow; queue sub-scan
                        stack.push([j + 1, start, lSlope])
                        newStart = rSlope
                    }
                }

                if (blocked) break              // shadow covered whole row — stop
            }
        }
    }

    return vis
}
