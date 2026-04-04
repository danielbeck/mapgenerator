import { TILE } from './tiles.js'

export const ENEMY_COLOR = '#dd2244'  // red

// Returns the correct indefinite article for an enemy kind (capitalized).
export function article(kind) {
    return /^[aeiou]/i.test(kind) ? 'An' : 'A'
}

// Per-kind combat stats.  difficulty 1–10 controls spawn depth.
export const ENEMY_STATS = {
    // ── Difficulty 1 ────────────────────────────────────
    rat: { maxHp: 5, attack: 1, difficulty: 1, xp: 15 },
    ant: { maxHp: 3, attack: 1, difficulty: 1, xp: 15 },
    bat: { maxHp: 6, attack: 2, difficulty: 1, xp: 15 },
    // ── Difficulty 2 ────────────────────────────────────
    snake: { maxHp: 8, attack: 2, difficulty: 2, xp: 30 },
    skeleton: { maxHp: 15, attack: 2, difficulty: 2, xp: 30 },
    // ── Difficulty 3 ────────────────────────────────────
    goblin: { maxHp: 20, attack: 3, difficulty: 3, xp: 45 },
    wolf: { maxHp: 25, attack: 4, difficulty: 3, xp: 45 },
    // ── Difficulty 4 ────────────────────────────────────
    spider: { maxHp: 35, attack: 4, difficulty: 4, xp: 60 },
    orc: { maxHp: 40, attack: 5, difficulty: 4, xp: 60 },
    // ── Difficulty 5 ────────────────────────────────────
    shade: { maxHp: 70, attack: 2, difficulty: 5, xp: 75 },
    ooze: { maxHp: 50, attack: 5, difficulty: 5, xp: 75 },
    // ── Difficulty 6 ────────────────────────────────────
    mimic: { maxHp: 40, attack: 6, difficulty: 6, xp: 90 },
    wraith: { maxHp: 45, attack: 6, difficulty: 6, xp: 90 },
    // ── Difficulty 7 ────────────────────────────────────
    golem: { maxHp: 80, attack: 5, difficulty: 7, xp: 105 },
    vampire: { maxHp: 60, attack: 7, difficulty: 7, xp: 105 },
    // ── Difficulty 8 ────────────────────────────────────
    troll: { maxHp: 90, attack: 7, difficulty: 8, xp: 120 },
    demon: { maxHp: 75, attack: 9, difficulty: 8, xp: 120 },
    // ── Difficulty 9 ────────────────────────────────────
    lich: { maxHp: 100, attack: 10, difficulty: 9, xp: 135 },
    nightmare: { maxHp: 80, attack: 12, difficulty: 9, xp: 135 },
    // ── Difficulty 10 ───────────────────────────────────
    dragon: { maxHp: 150, attack: 12, difficulty: 10, xp: 150 },
}

const FLEE_THRESHOLD = 0.25  // enemy flees below this fraction of max HP

// Cached for weighted selection
const ALL_ENEMY_ENTRIES = Object.entries(ENEMY_STATS)

/**
 * Pick a random enemy kind weighted so easier enemies are common, harder ones rare.
 * Eligible pool: difficulty <= min(10, mapsCleared + 2).
 * Weight = maxDiff + 2 - difficulty, so the hardest available enemy is the rarest.
 */
function pickKind(rng, mapsCleared) {
    const maxDiff = Math.min(10, mapsCleared + 2)
    const pool = ALL_ENEMY_ENTRIES.filter(([, s]) => s.difficulty <= maxDiff)
    const totalWeight = pool.reduce((sum, [, s]) => sum + (maxDiff + 2 - s.difficulty), 0)
    let r = rng() * totalWeight
    for (const [kind, stats] of pool) {
        r -= (maxDiff + 2 - stats.difficulty)
        if (r <= 0) return kind
    }
    return pool[pool.length - 1][0]
}

// Starting enemy count on map 0; grows ~1.2 per map cleared + complexity bonus
const BASE_ENEMY_COUNT = 4

/**
 * Place enemies randomly on OPEN tiles, decoupled from map generation.
 * Count scales primarily with mapsCleared (depth), with a small complexity modifier.
 * Entrance and exit tiles are always excluded.
 */
export function placeEnemies(map, rng, complexity, mapsCleared = 0) {
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
        BASE_ENEMY_COUNT + Math.round(mapsCleared * 1.2) + Math.round(complexity * 5),
        Math.floor(candidates.length / 20),
    )

    const enemies = []
    for (let i = 0; i < count && i < candidates.length; i++) {
        const j = i + Math.floor(rng() * (candidates.length - i))
            ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
        const idx = candidates[i]
        const kind = pickKind(rng, mapsCleared)
        enemies.push({
            x: idx % width,
            y: Math.floor(idx / width),
            kind,
            hp: ENEMY_STATS[kind].maxHp,
            introduced: false,   // true after first appearance in the combat log
            wasFleeing: false,   // previous-tick flee state, for transition detection
        })
    }
    return enemies
}

/**
 * Move each visible enemy one step closer to playerPos, or away if fleeing.
 * An enemy flees when its HP is below 25% of its max. Mutates in-place.
 * Enemies do not stack; they will not step onto the player tile.
 */
export function stepEnemiesCloser(enemies, map, playerPos, visibleArr) {
    const { width, height, tiles } = map
    const occupied = new Set(enemies.map(e => e.y * width + e.x))
    const messages = []

    for (const enemy of enemies) {
        const eIdx = enemy.y * width + enemy.x
        if (!visibleArr[eIdx]) continue

        const fleeing = enemy.hp / ENEMY_STATS[enemy.kind].maxHp < FLEE_THRESHOLD

        // First time this enemy is visible — announce it
        if (!enemy.introduced) {
            messages.push(`${article(enemy.kind)} ${enemy.kind} begins pursuing you!`)
            enemy.introduced = true
        }

        // Transition from chasing → fleeing
        if (fleeing && !enemy.wasFleeing) {
            messages.push(`The ${enemy.kind} turns to flee!`)
        }
        enemy.wasFleeing = fleeing

        let bestDist = (playerPos.x - enemy.x) ** 2 + (playerPos.y - enemy.y) ** 2
        let bx = enemy.x, by = enemy.y

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue
                const nx = enemy.x + dx, ny = enemy.y + dy
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
                const nIdx = ny * width + nx
                if (tiles[nIdx] === TILE.WALL) continue
                if (occupied.has(nIdx)) continue
                if (nx === playerPos.x && ny === playerPos.y) continue
                const d = (playerPos.x - nx) ** 2 + (playerPos.y - ny) ** 2
                if (fleeing ? d > bestDist : d < bestDist) {
                    bestDist = d; bx = nx; by = ny
                }
            }
        }

        if (bx !== enemy.x || by !== enemy.y) {
            occupied.delete(eIdx)
            enemy.x = bx
            enemy.y = by
            occupied.add(by * width + bx)
        }
    }
    return messages
}
