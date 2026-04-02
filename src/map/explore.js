import { TILE } from './tiles.js'
import { findPath } from './pathfind.js'

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]

// Radius used to count unknown tiles around a frontier when scoring it.
// Larger radius = stronger preference for open unexplored regions.
const EXPLORE_RADIUS = 12

/**
 * Count unknown (unseen) tiles within a circular radius around (fx, fy).
 * Used to reward frontiers that border large open unexplored areas.
 */
function countUnknownNearby(map, known, fx, fy, radius) {
    const { width, height } = map
    const r2 = radius * radius
    let count = 0
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy > r2) continue
            const nx = fx + dx, ny = fy + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            if (!known[ny * width + nx]) count++
        }
    }
    return count
}

/**
 * Decide the best next path given the character's current knowledge.
 *
 * • exitKnown=true  → A* to the exit through explored tiles.
 *                     If not yet reachable, fall through to explore mode.
 * • exitKnown=false → Walk to the best unexplored frontier, prioritising
 *                     frontiers that border large open unexplored regions
 *                     (maximises newly-revealed space per move).
 *
 * `momentum` — optional {dx, dy} unit vector of recent travel direction.
 *   Frontiers roughly ahead score better; frontiers behind are penalised.
 *
 * Always returns an array of {x,y} starting at `pos`.
 */
export function planPath(map, pos, known, exitKnown, momentum = null) {
    // Try to reach exit through known tiles
    if (exitKnown) {
        const path = findPath(map, pos, map.exit, known)
        if (path) return path
        // Known but not yet reachable through explored area — keep exploring
    }

    const frontiers = findFrontiers(map, known)

    if (frontiers.length === 0) {
        // Entire reachable space explored — try unrestricted path
        return findPath(map, pos, map.exit, null) ?? [pos]
    }

    // Rough pre-sort to focus A* attempts on promising candidates.
    //
    // Distance is SQUARED so nearby frontiers are heavily favoured — this is
    // the key to DFS-like behaviour in labyrinths: the character prefers the
    // frontier that is close right now over a globally "optimal" but far one.
    //
    // Momentum provides only a mild nudge (±15%) — not enough to overrule
    // distance, so the character won't thrash back and forth.
    //
    // Openness breaks ties between equidistant frontiers (preferring those
    // that border large open unexplored regions over narrow wall-edge strips).
    const scored = frontiers.map(f => {
        const dx = f.x - pos.x
        const dy = f.y - pos.y
        const man = Math.abs(dx) + Math.abs(dy)

        let momentumFactor = 1.0
        if (momentum && (momentum.dx !== 0 || momentum.dy !== 0)) {
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            const dot = (dx / len) * momentum.dx + (dy / len) * momentum.dy
            // Mild nudge only: ahead → ×0.85, behind → ×1.15
            momentumFactor = 1.0 - 0.15 * dot
        }

        const unknown = countUnknownNearby(map, known, f.x, f.y, EXPLORE_RADIUS)
        // man² makes distance the dominant factor; openness is a tie-breaker
        const score = (man * man * momentumFactor) / (1 + 0.06 * unknown)

        return { f, score }
    })

    scored.sort((a, b) => a.score - b.score)

    // Run A* on the top candidates and collect valid paths.
    // Then sort those paths by ACTUAL length — not Manhattan — to find the
    // truly nearest reachable frontier in maze topology.
    // This is the core DFS fix: always commit to the shortest actual path,
    // which naturally exhausts the current corridor before backtracking.
    const candidates = []
    for (let i = 0; i < Math.min(scored.length, 40); i++) {
        const path = findPath(map, pos, scored[i].f, known)
        if (path && path.length > 1) {
            candidates.push(path)
            if (candidates.length >= 10) break  // enough to reliably find the nearest
        }
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => a.length - b.length)
        return candidates[0]
    }

    // All frontiers unreachable through explored tiles — unrestricted fallback
    return findPath(map, pos, map.exit, null) ?? [pos]
}

/**
 * Return all tiles that are:
 *   • known (seen before)
 *   • not a wall (the character can stand there)
 *   • adjacent to at least one unknown tile
 *
 * These are the "edges" of explored space — walking to one will reveal new area.
 */
function findFrontiers(map, known) {
    const { width, height, tiles } = map
    const frontiers = []

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x
            if (!known[idx] || tiles[idx] === TILE.WALL) continue

            for (const [ddx, ddy] of DIRS4) {
                const nx = x + ddx, ny = y + ddy
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
                if (!known[ny * width + nx]) {
                    frontiers.push({ x, y })
                    break
                }
            }
        }
    }

    return frontiers
}
