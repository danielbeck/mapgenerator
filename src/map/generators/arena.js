import { TILE } from '../tiles.js'
import { createMapData, setTile } from '../mapData.js'

export const meta = {
    id: 'arena',
    label: 'Arena',
    description: 'A symmetrical coliseum-like open space with symmetric obstacles',
}

/**
 * Generates an elliptical open arena with 4-fold symmetric obstacles.
 *
 * complexity 0→1:
 *   wall thickness  6→2   (thicker outer ring at low end)
 *   obstacle sets   0→8   (more decoration at high end)
 *   obstacle size  big→small
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const cx = Math.floor(width / 2)
    const cy = Math.floor(height / 2)

    // Outer wall thickness scales with complexity
    const wallThick = Math.round(6 - complexity * 4)   // 6→2

    // Randomise the arena outline:
    //   exponent: 2 = ellipse, >2 = squircle, <2 = star-like (kept ≥1.4)
    //   aspect:   rx/ry ratio — 1 = circle, <1 = tall, >1 = wide
    const exponent = 1.4 + rng() * 2.6   // 1.4 – 4.0
    const aspect = 0.6 + rng() * 0.8   // 0.6 – 1.4

    const baseR = Math.min(cx, cy) - wallThick
    const rx = Math.round(baseR * Math.min(aspect, 1) * (cx / Math.min(cx, cy)))
    const ry = Math.round(baseR * Math.min(1 / aspect, 1) * (cy / Math.min(cx, cy)))

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = Math.abs((x - cx) / rx)
            const ny = Math.abs((y - cy) / ry)
            if (nx ** exponent + ny ** exponent <= 1.0) {
                setTile(map, x, y, TILE.OPEN)
            }
        }
    }

    // ── Symmetric obstacles ──────────────────────────────────────────────────
    // All obstacles are painted using 4-fold symmetry.
    // The number and type of obstacle groups are randomised per-map;
    // complexity still governs the upper bound and obstacle sizing.

    // Max groups scales with complexity; actual count is randomised within that
    const maxGroups = Math.round(1 + complexity * 7)        // 1–8
    const numGroups = 1 + Math.floor(rng() * maxGroups)     // at least 1

    for (let g = 0; g < numGroups; g++) {
        // Random radial position within the arena (20%–80% of each radius)
        const fracX = 0.2 + rng() * 0.6
        const fracY = 0.2 + rng() * 0.6
        const ox = Math.round(rx * fracX)
        const oy = Math.round(ry * fracY)

        // Random obstacle type per group
        const type = Math.floor(rng() * 3)

        if (type === 0) {
            // Pillar — square block
            const pillarR = Math.max(1, Math.round(1 + (1 - complexity) * 3 + rng() * 2))
            paintSymRect(map, cx, cy, ox, oy, pillarR, pillarR)
        } else if (type === 1) {
            // Wall segment — elongated horizontally or vertically
            const thick = Math.max(1, Math.round(1 + (1 - complexity) * 2))
            const length = Math.max(2, Math.round(3 + rng() * (8 - complexity * 5)))
            if (rng() < 0.5) {
                paintSymRect(map, cx, cy, ox, oy, thick, length)
            } else {
                paintSymRect(map, cx, cy, ox, oy, length, thick)
            }
        } else {
            // Axis-aligned wall anchored to a cardinal axis (ox or oy = 0)
            const thick = Math.max(1, Math.round(1 + (1 - complexity) * 2))
            const length = Math.max(2, Math.round(4 + rng() * (10 - complexity * 6)))
            if (rng() < 0.5) {
                paintSymRect(map, cx, cy, ox, 0, thick, length)
            } else {
                paintSymRect(map, cx, cy, 0, oy, length, thick)
            }
        }
    }

    placeArenaEndpoints(map, cx, cy, rx, ry, rng)
    return map
}

// ---------------------------------------------------------------------------
// Arena-specific endpoint placement.
// Picks a random axis angle, then walks inward from each pole along that
// axis, skipping wall tiles so the endpoints land on open floor that is
// naturally inset from the boundary.
// ---------------------------------------------------------------------------

function placeArenaEndpoints(map, cx, cy, rx, ry, rng) {
    // Random angle — 8 evenly spaced orientations give horizontal, vertical,
    // and diagonal axes; a small random jitter shifts away from the exact
    // cardinals so endpoints aren't always perfectly symmetric.
    const baseAngle = Math.floor(rng() * 8) * (Math.PI / 4)
    const jitter = (rng() - 0.5) * (Math.PI / 8)
    const angle = baseAngle + jitter

    // How far inset from the true ellipse boundary (10%–35% of radius)
    const insetFrac = 0.10 + rng() * 0.25

    // Pole A and pole B are on opposite ends of the chosen axis
    const poleAx = cx + Math.cos(angle) * rx
    const poleAy = cy + Math.sin(angle) * ry
    const poleBx = cx + Math.cos(angle + Math.PI) * rx
    const poleBy = cy + Math.sin(angle + Math.PI) * ry

    const entrance = findInsetPoint(map, cx, cy, poleAx, poleAy, insetFrac)
    const exit_ = findInsetPoint(map, cx, cy, poleBx, poleBy, insetFrac)

    setTile(map, entrance.x, entrance.y, TILE.ENTRANCE)
    setTile(map, exit_.x, exit_.y, TILE.EXIT)
    map.entrance = entrance
    map.exit = exit_
}

/**
 * Walk from the boundary pole toward the centre along the line (pole→centre),
 * skipping the outermost wall tiles, and return the first open tile found
 * at or beyond the inset fraction of the way to the centre.
 */
function findInsetPoint(map, cx, cy, poleX, poleY, insetFrac) {
    const dx = cx - poleX
    const dy = cy - poleY
    const len = Math.sqrt(dx * dx + dy * dy)
    const steps = Math.ceil(len)

    // Start walking from the inset fraction
    const startStep = Math.floor(steps * insetFrac)

    for (let s = startStep; s <= steps; s++) {
        const t = s / steps
        const x = Math.round(poleX + dx * t)
        const y = Math.round(poleY + dy * t)
        if (x >= 0 && x < map.width && y >= 0 && y < map.height) {
            if (map.tiles[y * map.width + x] === TILE.OPEN) {
                return { x, y }
            }
        }
    }

    // Fallback: centre tile (should never be needed)
    return { x: cx, y: cy }
}

// ---------------------------------------------------------------------------
// Paint a rectangular block with 4-fold symmetry.
// (ox, oy) is the offset from the map centre in positive-x, positive-y.
// When ox === 0 or oy === 0 the mirrored copies overlap correctly (only
// two or one copy is painted, not four).
// ---------------------------------------------------------------------------
function paintSymRect(map, cx, cy, ox, oy, hw, hh) {
    const quadrants = [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
    ]

    // Deduplicate so axis-aligned blocks don't get double-walled
    const seen = new Set()
    for (const [sx, sy] of quadrants) {
        const bx = cx + sx * ox
        const by = cy + sy * oy
        const key = `${bx},${by}`
        if (seen.has(key)) continue
        seen.add(key)
        for (let dy = -hh; dy <= hh; dy++) {
            for (let dx = -hw; dx <= hw; dx++) {
                const tx = bx + dx
                const ty = by + dy
                if (tx >= 0 && tx < map.width && ty >= 0 && ty < map.height) {
                    setTile(map, tx, ty, TILE.WALL)
                }
            }
        }
    }
}
