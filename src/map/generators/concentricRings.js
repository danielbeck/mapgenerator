import { TILE } from '../tiles.js'
import { createMapData, setTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'concentric-rings',
    label: 'Concentric Rings',
    description: 'Nested defensive walls with offset gateways — navigate inward through each ring',
}

/**
 * N concentric rectangular rings (like castle baileys), each connected to its
 * neighbours by 1–3 narrow gateway passages. The gateways through adjacent
 * rings are deliberately offset so you can't see straight from outer to inner.
 *
 * At low complexity: 2 wide rings, wide gateways, gentle inward spiral.
 * At high complexity: 5 thin-walled rings, narrow single-tile choke points,
 * many offset gates.
 *
 * complexity 0→1:
 *   ring count        2→5
 *   wall thickness    3→1
 *   gateway width     5→1
 *   gateways/ring     1→3
 *   ring spacing     12→6   tiles between ring walls
 *   rotation jitter   0→8°  slight tilt per ring for organic feel
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const ringCount = Math.round(2 + complexity * 3)     // 2→5
    const wallThick = Math.round(3 - complexity * 2)     // 3→1
    const gateW = Math.round(5 - complexity * 4)     // 5→1
    const gatesPerRing = Math.round(1 + complexity * 2)     // 1→3
    const ringSpacing = Math.round(12 - complexity * 6)    // 12→6

    const cx = Math.floor(width / 2)
    const cy = Math.floor(height / 2)

    const chamberHalf = Math.round(5 + rng() * 3)

    // Build ring boundaries (innermost first in array)
    const ringInners = []
    const ringOuters = []
    let prevOuter = chamberHalf
    for (let i = 0; i < ringCount; i++) {
        const inner = prevOuter + ringSpacing
        const outer = inner + wallThick
        if (outer >= Math.min(cx, cy) * 0.92) break
        ringInners.push(inner)
        ringOuters.push(outer)
        prevOuter = outer
    }
    const actualCount = ringInners.length

    // 1. Open everything inside the outermost wall's outer edge
    const maxR = actualCount > 0 ? ringOuters[actualCount - 1] : chamberHalf
    for (let y = cy - maxR; y <= cy + maxR; y++) {
        for (let x = cx - maxR; x <= cx + maxR; x++) {
            if (x >= 0 && x < width && y >= 0 && y < height) {
                setTile(map, x, y, TILE.OPEN)
            }
        }
    }

    // 2. Draw each wall ring (band between inner and outer edge), then punch gateways.
    // Tracks which sides the previous ring used, so each ring offsets its gates.
    let prevSides = []
    for (let i = 0; i < actualCount; i++) {
        const wi = ringInners[i]
        const wo = ringOuters[i]

        // Draw the rectangular wall band
        for (let y = cy - wo; y <= cy + wo; y++) {
            for (let x = cx - wo; x <= cx + wo; x++) {
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    if (Math.abs(x - cx) >= wi || Math.abs(y - cy) >= wi) {
                        setTile(map, x, y, TILE.WALL)
                    }
                }
            }
        }

        // Punch gateways — pick sides not used by the previous ring first
        const allSides = shuffled([0, 1, 2, 3], rng)
        // Prefer sides that differ from previous ring's sides for offset feel
        const preferred = allSides.filter(s => !prevSides.includes(s))
        const fallback = allSides.filter(s => prevSides.includes(s))
        const ordered = [...preferred, ...fallback]
        const sides = ordered.slice(0, Math.min(gatesPerRing, 4))
        prevSides = sides

        for (const side of sides) {
            // Random offset along the wall so gates don't align radially
            const offset = Math.round((rng() - 0.5) * wi * 0.7)
            // wall thickness in tiles: from inner edge (wi) to outer edge (wo), inclusive = wo-wi+1
            const depth = wo - wi + 1

            if (side === 0 || side === 1) {
                // Top / bottom wall: runs from cy∓wo to cy∓wi (inclusive)
                const gy = side === 0 ? cy - wo : cy + wi
                const gx0 = cx + offset - Math.floor(gateW / 2)
                for (let dy = 0; dy < depth; dy++) {
                    for (let dx = 0; dx < gateW; dx++) {
                        const tx = gx0 + dx, ty = gy + dy
                        if (tx >= 0 && tx < width && ty >= 0 && ty < height)
                            setTile(map, tx, ty, TILE.OPEN)
                    }
                }
            } else {
                // Left / right wall: runs from cx∓wo to cx∓wi (inclusive)
                const gx = side === 2 ? cx - wo : cx + wi
                const gy0 = cy + offset - Math.floor(gateW / 2)
                for (let dx = 0; dx < depth; dx++) {
                    for (let dy = 0; dy < gateW; dy++) {
                        const tx = gx + dx, ty = gy0 + dy
                        if (tx >= 0 && tx < width && ty >= 0 && ty < height)
                            setTile(map, tx, ty, TILE.OPEN)
                    }
                }
            }
        }
    }

    floodKeepLargest(map)
    placeEndpoints(map, rng)
    return map
}

function shuffled(arr, rng) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
            ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
}
