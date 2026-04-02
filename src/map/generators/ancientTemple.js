import { TILE } from '../tiles.js'
import { createMapData, setTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'ancient-temple',
    label: 'Ancient Temple',
    description: 'Nested chambers each rotated from the last, with offset passage doorways',
}

/**
 * N nested rectangular rooms. Each ring MAY rotate a small amount from the
 * previous one — but only occasionally, so most rings share the same angle
 * and the overall mass feels planted rather than mechanical.
 *
 * Rings are decorated with:
 *   • Corner towers   — solid square protrusions at corners (fortress feel)
 *   • Interior alcoves — recesses carved mid-wall from the corridor side
 *   • Exterior chapels — small attached rooms on the outer face (high complexity)
 *
 * complexity 0→1:
 *   ring count        2→5
 *   wall thickness    3→1
 *   passage width     5→1
 *   rotation step     1°→3°  (applied ~30% of transitions, either direction)
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const ringCount = Math.round(2 + complexity * 3)          // 2→5
    const wallThick = Math.round(3 - complexity * 2)          // 3→1
    const passageW = Math.round(5 - complexity * 4)          // 5→1
    const rotStep = (1 + complexity * 2) * Math.PI / 180   // 1°→3° per occasional step
    const rotChance = 0.3                                      // 30% chance to rotate each ring

    const cx = width / 2
    const cy = height / 2

    const outerHalf = Math.round(Math.min(cx, cy) * 0.88)
    const step = Math.floor((outerHalf - 6) / ringCount)

    // Random base tilt varies the whole structure seed-to-seed
    let cumulativeRot = (rng() - 0.5) * 0.3

    // Paint one tile in this ring's rotated world space
    function paintAt(lx, ly, cosR, sinR, tile) {
        const wx = Math.round(cx + lx * cosR - ly * sinR)
        const wy = Math.round(cy + lx * sinR + ly * cosR)
        if (wx >= 0 && wx < width && wy >= 0 && wy < height)
            setTile(map, wx, wy, tile)
    }

    for (let ring = 0; ring < ringCount; ring++) {
        // Rotate only occasionally, in a random direction each time
        if (rng() < rotChance) cumulativeRot += rotStep * (rng() > 0.5 ? 1 : -1)

        const halfSize = outerHalf - ring * step
        if (halfSize < 6) break

        const cosR = Math.cos(cumulativeRot)
        const sinR = Math.sin(cumulativeRot)
        const outerH = halfSize
        const innerH = halfSize - wallThick
        const p = (lx, ly, t) => paintAt(lx, ly, cosR, sinR, t)

        // ── Wall band ───────────────────────────────────────────────────────────
        const span = halfSize + 6  // a little extra for corner towers
        for (let ly = -span; ly <= span; ly++) {
            for (let lx = -span; lx <= span; lx++) {
                const inOuter = Math.abs(lx) <= outerH && Math.abs(ly) <= outerH
                const inInner = Math.abs(lx) < innerH && Math.abs(ly) < innerH
                if (inOuter && !inInner) p(lx, ly, TILE.WALL)
            }
        }

        // ── Corridor interior ───────────────────────────────────────────────────
        for (let ly = -(innerH - 1); ly <= innerH - 1; ly++) {
            for (let lx = -(innerH - 1); lx <= innerH - 1; lx++) {
                p(lx, ly, TILE.OPEN)
            }
        }

        // ── Corner towers ───────────────────────────────────────────────────────
        // Solid square bumps at the four wall corners — architectural mass
        if (rng() < 0.65) {
            const tR = 2 + Math.floor(rng() * 2)  // radius 2 or 3
            for (const [sx, sy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
                if (rng() < 0.75) {  // asymmetric: not all four always appear
                    const clx = sx * outerH
                    const cly = sy * outerH
                    for (let dy = -tR; dy <= tR; dy++)
                        for (let dx = -tR; dx <= tR; dx++)
                            p(clx + dx, cly + dy, TILE.WALL)
                }
            }
        }

        // ── Interior alcoves ────────────────────────────────────────────────────
        // At high complexity: up to all 4 walls, and depth can punch through the
        // wall fully and into the inter-ring gap, creating dramatic irregular notches.
        const alcoveCount = Math.floor(rng() * (complexity * 4.5 + 1))  // 0→4
        const alcoveSides = shuffled([0, 1, 2, 3], rng).slice(0, alcoveCount)
        for (const side of alcoveSides) {
            const aW = Math.round(3 + rng() * innerH * (0.25 + complexity * 0.5))
            // At high complexity let depth overflow the wall into the corridor gap
            const maxD = wallThick + Math.round(complexity * step * 0.7)
            const aD = Math.round(wallThick * 0.5 + rng() * maxD)
            for (let t = -Math.floor(aW / 2); t <= Math.floor(aW / 2); t++) {
                for (let d = 0; d < aD; d++) {
                    let lx, ly
                    if (side === 0) { lx = t; ly = -(innerH + d) }
                    else if (side === 1) { lx = t; ly = (innerH + d) }
                    else if (side === 2) { lx = -(innerH + d); ly = t }
                    else { lx = (innerH + d); ly = t }
                    p(lx, ly, TILE.OPEN)
                }
            }
        }

        // ── Exterior chapels ─────────────────────────────────────────────────────
        // At high complexity: 1–3 chapels per ring on different sides, large enough
        // to visually dominate and interrupt the clean concentric outline.
        const chapelCount = rng() < (0.15 + complexity * 0.85)
            ? Math.round(1 + rng() * complexity * 2.5) : 0          // 0 rarely; up to 3 at c=1
        const chapelSides = shuffled([0, 1, 2, 3], rng).slice(0, chapelCount)
        for (const side of chapelSides) {
            const maxW = 4 + Math.round(outerH * (0.15 + complexity * 0.55))
            const exW = Math.round(5 + rng() * maxW)
            const exD = Math.round(3 + rng() * (2 + complexity * 8))  // depth 3–13 at c=1
            const offset = Math.round((rng() - 0.5) * innerH * 0.55)
            for (let t = -Math.floor(exW / 2); t <= Math.floor(exW / 2); t++) {
                for (let d = 1; d <= exD; d++) {
                    let lx, ly
                    if (side === 0) { lx = offset + t; ly = -(outerH + d) }
                    else if (side === 1) { lx = offset + t; ly = (outerH + d) }
                    else if (side === 2) { lx = -(outerH + d); ly = offset + t }
                    else { lx = (outerH + d); ly = offset + t }
                    p(lx, ly, TILE.OPEN)
                }
            }
        }

        // ── Corridor piers (high complexity only) ────────────────────────────────
        // Short WALL stubs projecting outward from the ring face into the corridor,
        // dividing it into bays and disrupting the circular flow.
        if (complexity > 0.55 && ring < ringCount - 1) {
            const pierCount = Math.floor(rng() * (complexity * 3.5))      // 0→3
            for (let pi = 0; pi < pierCount; pi++) {
                const side = Math.floor(rng() * 4)
                const pos = Math.round((rng() - 0.5) * innerH * 0.65)
                const pierW = 1 + Math.floor(rng() * 2)
                const pierL = Math.round(step * (0.25 + rng() * 0.5))      // 25–75% of ring gap
                for (let t = -Math.floor(pierW / 2); t <= Math.floor(pierW / 2); t++) {
                    for (let d = 0; d <= pierL; d++) {
                        let lx, ly
                        if (side === 0) { lx = pos + t; ly = -(outerH + d) }
                        else if (side === 1) { lx = pos + t; ly = (outerH + d) }
                        else if (side === 2) { lx = -(outerH + d); ly = pos + t }
                        else { lx = (outerH + d); ly = pos + t }
                        p(lx, ly, TILE.WALL)
                    }
                }
            }
        }

        // ── Passage doorways ────────────────────────────────────────────────────
        const numPassages = ring < ringCount - 1 ? 1 + (rng() < 0.5 ? 1 : 0) : 1
        const sides = shuffled([0, 1, 2, 3], rng).slice(0, numPassages)

        for (const side of sides) {
            const perpOffset = Math.round((rng() - 0.5) * innerH * 0.6)
            const wallCoord = halfSize - Math.floor(wallThick / 2)

            for (let t = -Math.floor(passageW / 2); t <= Math.floor(passageW / 2); t++) {
                for (let d = -wallThick; d <= wallThick; d++) {
                    let lx, ly
                    if (side === 0) { lx = perpOffset + t; ly = -wallCoord + d }
                    else if (side === 1) { lx = perpOffset + t; ly = wallCoord + d }
                    else if (side === 2) { lx = -wallCoord + d; ly = perpOffset + t }
                    else { lx = wallCoord + d; ly = perpOffset + t }
                    p(lx, ly, TILE.OPEN)
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
