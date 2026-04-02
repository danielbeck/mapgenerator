import { TILE } from '../tiles.js'
import { createMapData, setTile, getTile, floodKeepLargest } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'ruined-halls',
    label: 'Ruined Halls',
    description: 'Colonnaded chambers of a long-collapsed structure, divided by archways and rubble',
}

/**
 * A vast open interior (Roman basilica / medieval great hall, now collapsed)
 * featuring:
 *   - Column grid: regular pillar obstacles throughout the space
 *   - Dividing walls with doorway gaps subdividing the hall into bays
 *   - Edge niches: alcoves recessed into the outer walls (side chapels)
 *   - Rubble scatter at higher complexity
 *
 * complexity 0→1:
 *   column spacing  14→7   (sparse fat pillars → dense single-tile columns)
 *   dividers         1→4   (one great hall → many subdivided bays)
 *   door width       5→2   (wide arches → narrow doorways)
 *   niches           2→6   edge alcoves
 *   rubble           0→55  scattered wall tiles
 */
export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    const margin = 8
    const colSpacing = Math.round(14 - complexity * 7)    // 14→7
    const bigColumns = complexity < 0.5                   // 2×2 at low, 1×1 at high
    const divCount = Math.round(1 + complexity * 3)     // 1→4
    const doorW = Math.round(5 - complexity * 3)     // 5→2
    const nicheCount = Math.round(2 + complexity * 4)     // 2→6
    const rubbleCount = Math.round(complexity * 55)        // 0→55

    // ── Open interior (outer walls are the default WALL tiles) ───────────────
    for (let y = margin; y < height - margin; y++) {
        for (let x = margin; x < width - margin; x++) {
            setTile(map, x, y, TILE.OPEN)
        }
    }

    // ── Column grid ──────────────────────────────────────────────────────────
    for (let gy = margin + colSpacing; gy < height - margin; gy += colSpacing) {
        for (let gx = margin + colSpacing; gx < width - margin; gx += colSpacing) {
            const jx = Math.round((rng() - 0.5) * colSpacing * 0.3)
            const jy = Math.round((rng() - 0.5) * colSpacing * 0.3)
            const cx = clamp(gx + jx, margin + 1, width - margin - 2)
            const cy = clamp(gy + jy, margin + 1, height - margin - 2)
            if (bigColumns) {
                // 2×2 pillar
                setTile(map, cx, cy, TILE.WALL)
                setTile(map, cx + 1, cy, TILE.WALL)
                setTile(map, cx, cy + 1, TILE.WALL)
                setTile(map, cx + 1, cy + 1, TILE.WALL)
            } else {
                setTile(map, cx, cy, TILE.WALL)
            }
        }
    }

    // ── Dividing walls with doorway gaps ─────────────────────────────────────
    // Even dividers are horizontal, odd are vertical.
    const numH = Math.ceil(divCount / 2)
    const numV = Math.floor(divCount / 2)

    for (let i = 0; i < numH; i++) {
        const t = (i + 1) / (numH + 1)
        const y = clamp(
            Math.round(margin + t * (height - 2 * margin) + (rng() - 0.5) * 10),
            margin + 4, height - margin - 5)
        carveDivider(map, 'h', y, margin, width, height, doorW, rng)
    }
    for (let i = 0; i < numV; i++) {
        const t = (i + 1) / (numV + 1)
        const x = clamp(
            Math.round(margin + t * (width - 2 * margin) + (rng() - 0.5) * 10),
            margin + 4, width - margin - 5)
        carveDivider(map, 'v', x, margin, width, height, doorW, rng)
    }

    // ── Edge niches (alcoves recessed into outer walls) ───────────────────────
    // Each niche extends outward FROM the interior edge into the outer wall,
    // so it connects naturally to the main hall.
    for (let n = 0; n < nicheCount; n++) {
        const edge = Math.floor(rng() * 4)      // 0=top 1=bottom 2=left 3=right
        const nicheW = Math.round(6 + rng() * 7)  // 6-13 tiles wide
        const nicheD = Math.round(3 + rng() * 4)  // 3-7 tiles deep

        if (edge === 0) {
            const nx = margin + Math.round(rng() * Math.max(0, width - 2 * margin - nicheW))
            for (let dy = 0; dy <= nicheD; dy++) {
                for (let dx = 0; dx < nicheW; dx++) {
                    const tx = nx + dx, ty = margin - dy
                    if (tx >= 0 && tx < width && ty >= 0) setTile(map, tx, ty, TILE.OPEN)
                }
            }
        } else if (edge === 1) {
            const nx = margin + Math.round(rng() * Math.max(0, width - 2 * margin - nicheW))
            for (let dy = 0; dy <= nicheD; dy++) {
                for (let dx = 0; dx < nicheW; dx++) {
                    const tx = nx + dx, ty = height - margin + dy
                    if (tx >= 0 && tx < width && ty < height) setTile(map, tx, ty, TILE.OPEN)
                }
            }
        } else if (edge === 2) {
            const ny = margin + Math.round(rng() * Math.max(0, height - 2 * margin - nicheW))
            for (let dx = 0; dx <= nicheD; dx++) {
                for (let dy = 0; dy < nicheW; dy++) {
                    const tx = margin - dx, ty = ny + dy
                    if (tx >= 0 && ty >= 0 && ty < height) setTile(map, tx, ty, TILE.OPEN)
                }
            }
        } else {
            const ny = margin + Math.round(rng() * Math.max(0, height - 2 * margin - nicheW))
            for (let dx = 0; dx <= nicheD; dx++) {
                for (let dy = 0; dy < nicheW; dy++) {
                    const tx = width - margin + dx, ty = ny + dy
                    if (tx < width && ty >= 0 && ty < height) setTile(map, tx, ty, TILE.OPEN)
                }
            }
        }
    }

    // ── Rubble scatter ───────────────────────────────────────────────────────
    for (let i = 0; i < rubbleCount; i++) {
        const rx = margin + Math.floor(rng() * (width - 2 * margin))
        const ry = margin + Math.floor(rng() * (height - 2 * margin))
        if (getTile(map, rx, ry) === TILE.OPEN) {
            setTile(map, rx, ry, TILE.WALL)
            if (rng() < 0.4) {
                const r2x = rx + (rng() < 0.5 ? 1 : -1)
                const r2y = ry + (rng() < 0.5 ? 1 : -1)
                if (r2x >= margin && r2x < width - margin && r2y >= margin && r2y < height - margin) {
                    setTile(map, r2x, r2y, TILE.WALL)
                }
            }
        }
    }

    floodKeepLargest(map)
    placeEndpoints(map, rng)
    return map
}

// ---------------------------------------------------------------------------
// Carve a 2-tile-thick dividing wall across the full interior, then punch
// doorway gaps through it at evenly-spaced (jittered) positions.
// ---------------------------------------------------------------------------

function carveDivider(map, axis, pos, margin, width, height, doorW, rng) {
    if (axis === 'h') {
        for (let x = margin; x < width - margin; x++) {
            setTile(map, x, pos, TILE.WALL)
            setTile(map, x, pos + 1, TILE.WALL)
        }
        const numGaps = 2 + Math.floor(rng() * 2)
        const segW = (width - 2 * margin) / numGaps
        for (let g = 0; g < numGaps; g++) {
            const gx = Math.round(margin + (g + 0.25 + rng() * 0.5) * segW)
            for (let dx = 0; dx < doorW; dx++) {
                const tx = gx + dx
                if (tx >= margin && tx < width - margin) {
                    setTile(map, tx, pos, TILE.OPEN)
                    setTile(map, tx, pos + 1, TILE.OPEN)
                }
            }
        }
    } else {
        for (let y = margin; y < height - margin; y++) {
            setTile(map, pos, y, TILE.WALL)
            setTile(map, pos + 1, y, TILE.WALL)
        }
        const numGaps = 2 + Math.floor(rng() * 2)
        const segH = (height - 2 * margin) / numGaps
        for (let g = 0; g < numGaps; g++) {
            const gy = Math.round(margin + (g + 0.25 + rng() * 0.5) * segH)
            for (let dy = 0; dy < doorW; dy++) {
                const ty = gy + dy
                if (ty >= margin && ty < height - margin) {
                    setTile(map, pos, ty, TILE.OPEN)
                    setTile(map, pos + 1, ty, TILE.OPEN)
                }
            }
        }
    }
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v))
}
