import { TILE } from './tiles.js'

export const POTION_COLOR = '#1e90ff'  // blue
export const POTION_HEAL = 15         // HP restored on pickup

// Map 0 starts with 4 potions; grows ~0.8 per map + small complexity bonus
const BASE_POTION_COUNT = 4

/**
 * Place health potions randomly on OPEN tiles, decoupled from map generation.
 * Count scales with mapsCleared so later maps have more recovery options.
 */
export function placePotions(map, rng, complexity, mapsCleared = 0) {
    const { width, tiles, entrance, exit } = map
    const forbidden = new Set([
        entrance.y * width + entrance.x,
        exit.y * width + exit.x,
    ])

    const candidates = []
    for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] === TILE.OPEN && !forbidden.has(i)) candidates.push(i)
    }
    if (candidates.length === 0) return []

    const count = Math.min(
        BASE_POTION_COUNT + Math.round(mapsCleared * 0.8) + Math.round(complexity * 3),
        Math.floor(candidates.length / 15),
    )

    const potions = []
    for (let i = 0; i < count && i < candidates.length; i++) {
        const j = i + Math.floor(rng() * (candidates.length - i))
            ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
        const idx = candidates[i]
        potions.push({ x: idx % width, y: Math.floor(idx / width) })
    }
    return potions
}
