import { findPath } from '../map/pathfind.js'

export const HP_HIGH_THRESHOLD = 0.9  // above this: chase enemies first
export const HP_REGEN = 0.3           // HP recovered per step with no enemies in sight

/**
 * Update passive per-tick state: HP regen when no enemies in sight.
 * Returns { newHp }
 */
export function updatePassiveState({ hp, maxHp, visibleEnemies }) {
    if (visibleEnemies.length === 0) {
        return { newHp: Math.min(maxHp, hp + HP_REGEN) }
    }
    return { newHp: hp }
}

/**
 * Choose a behavior-driven path override based on current game state.
 * Returns { path: Array | null }
 * path === null means "do not override: let the exploration planner decide".
 *
 * High HP (> 90%):  enemies → exit → explore
 * Low HP  (≤ 90%):  potions → exit → explore → enemies
 */
export function chooseBehaviorPath({
    pos, map, known, hp, maxHp,
    visibleEnemies, visiblePotions,
    exitKnown,
}) {
    const highHp = hp / maxHp > HP_HIGH_THRESHOLD

    if (highHp) {
        // 1. Chase nearest visible enemy
        if (visibleEnemies.length > 0) {
            const nearest = visibleEnemies.reduce((b, e) =>
                dist2(e, pos) < dist2(b, pos) ? e : b)
            const path = findPath(map, pos, { x: nearest.x, y: nearest.y }, known)
            if (path && path.length > 1) return { path }
        }

        // 2. Head to exit
        if (exitKnown) {
            const path = findPath(map, pos, { x: map.exit.x, y: map.exit.y }, known)
            if (path && path.length > 1) return { path }
        }

        // 3. Explore (let planner decide)
        return { path: null }
    }

    // Low HP
    // 1. Route to nearest visible potion
    if (visiblePotions.length > 0) {
        const nearest = visiblePotions.reduce((b, p) =>
            dist2(p, pos) < dist2(b, pos) ? p : b)
        const path = findPath(map, pos, nearest, known)
        if (path && path.length > 1) return { path }
    }

    // 2. Head to exit
    if (exitKnown) {
        const path = findPath(map, pos, { x: map.exit.x, y: map.exit.y }, known)
        if (path && path.length > 1) return { path }
    }

    // 3. Explore (let planner decide)
    // 4. If visible enemies remain after exploration exhausted, fight the nearest
    //    (adjacency combat fires automatically; this just ensures we don't idle)
    if (visibleEnemies.length > 0) {
        const nearest = visibleEnemies.reduce((b, e) =>
            dist2(e, pos) < dist2(b, pos) ? e : b)
        const path = findPath(map, pos, { x: nearest.x, y: nearest.y }, known)
        if (path && path.length > 1) return { path }
    }

    return { path: null }
}

function dist2(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }
