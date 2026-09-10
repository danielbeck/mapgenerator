// simulate.js  — Dungeon balance simulator
// Run: node simulate.js
// Mirrors the exact constants and formulas from the game source.

// ── Enemy stats (enemies.js) ─────────────────────────────────────────────────
const ENEMY_STATS = {
    rat: { maxHp: 5, attack: 1, difficulty: 1, xp: 15 },
    ant: { maxHp: 3, attack: 1, difficulty: 1, xp: 15 },
    bat: { maxHp: 6, attack: 2, difficulty: 1, xp: 15 },
    snake: { maxHp: 8, attack: 2, difficulty: 2, xp: 30 },
    skeleton: { maxHp: 15, attack: 2, difficulty: 2, xp: 30 },
    goblin: { maxHp: 20, attack: 3, difficulty: 3, xp: 45 },
    wolf: { maxHp: 25, attack: 4, difficulty: 3, xp: 45 },
    spider: { maxHp: 35, attack: 4, difficulty: 4, xp: 60 },
    orc: { maxHp: 40, attack: 5, difficulty: 4, xp: 60 },
    shade: { maxHp: 70, attack: 2, difficulty: 5, xp: 75 },
    ooze: { maxHp: 50, attack: 5, difficulty: 5, xp: 75 },
    mimic: { maxHp: 40, attack: 6, difficulty: 6, xp: 90 },
    wraith: { maxHp: 45, attack: 6, difficulty: 6, xp: 90 },
    golem: { maxHp: 80, attack: 5, difficulty: 7, xp: 105 },
    vampire: { maxHp: 60, attack: 7, difficulty: 7, xp: 105 },
    troll: { maxHp: 90, attack: 7, difficulty: 8, xp: 120 },
    demon: { maxHp: 75, attack: 9, difficulty: 8, xp: 120 },
    lich: { maxHp: 100, attack: 10, difficulty: 9, xp: 135 },
    nightmare: { maxHp: 80, attack: 12, difficulty: 9, xp: 135 },
    dragon: { maxHp: 150, attack: 12, difficulty: 10, xp: 150 },
}
const ALL_ENEMY_ENTRIES = Object.entries(ENEMY_STATS)

// ── Constants matching source ────────────────────────────────────────────────
const POTION_HEAL = 15
const HP_REGEN = 0.3      // per step, no enemies visible
const ARMOR_BLOCK_CHANCE = 0.80
const BASE_ENEMY_COUNT = 4
const BASE_POTION_COUNT = 4
const COMPLEXITY = 0.5      // midpoint slider

// ── Formulas matching source ─────────────────────────────────────────────────
function xpToLevel(l) { return 100 + (l - 1) * 50 }

function enemyCount(mapsCleared) {
    return BASE_ENEMY_COUNT
        + Math.round(mapsCleared * 1.2)
        + Math.round(COMPLEXITY * 5)
}

function potionCount(mapsCleared) {
    return BASE_POTION_COUNT
        + Math.round(mapsCleared * 0.8)
        + Math.round(COMPLEXITY * 3)
}

function pickKind(mapsCleared) {
    const maxDiff = Math.min(10, mapsCleared + 2)
    const pool = ALL_ENEMY_ENTRIES.filter(([, s]) => s.difficulty <= maxDiff)
    const totalWeight = pool.reduce((sum, [, s]) => sum + (maxDiff + 2 - s.difficulty), 0)
    let r = Math.random() * totalWeight
    for (const [kind, stats] of pool) {
        r -= (maxDiff + 2 - stats.difficulty)
        if (r <= 0) return kind
    }
    return pool[pool.length - 1][0]
}

// ── Simulate fighting one enemy ──────────────────────────────────────────────
// Approximate steps to walk between each enemy encounter in the dungeon.
const STEPS_BETWEEN_FIGHTS = 40

// ── Run simulation ───────────────────────────────────────────────────────────
const RUNS = 3000
const MAX_MAPS = 30

function runSimulation(lootChance) {
    const depthCount = new Array(MAX_MAPS + 1).fill(0)
    const deathsAt = new Array(MAX_MAPS + 1).fill(0)
    const statSamples = Array.from({ length: MAX_MAPS }, () => ({ n: 0, atk: 0, arm: 0, lvl: 0 }))
    let totalDepth = 0

    for (let run = 0; run < RUNS; run++) {
        let state = { hp: 100, maxHp: 100, level: 1, xp: 0, attack: 5, armor: 0, mapsCleared: 0 }

        while (state.mapsCleared < MAX_MAPS) {
            const d = state.mapsCleared
            statSamples[d].n++
            statSamples[d].atk += state.attack
            statSamples[d].arm += state.armor
            statSamples[d].lvl += state.level

            // fight with overridden loot chance
            const enemies = Array.from({ length: enemyCount(d) }, () => pickKind(d))
            let potionsLeft = potionCount(d)
            let { hp, maxHp, level, xp, attack, armor } = state
            let died = false

            for (const kind of enemies) {
                hp = Math.min(maxHp, hp + HP_REGEN * STEPS_BETWEEN_FIGHTS)
                while (potionsLeft > 0 && hp < maxHp * 0.60) {
                    hp = Math.min(maxHp, hp + POTION_HEAL); potionsLeft--
                }
                const s = ENEMY_STATS[kind]
                let eHp = s.maxHp; let hpLost = 0; let ticks = 0
                while (eHp > 0 && ticks < 5000) {
                    eHp -= attack
                    if (eHp > 0) {
                        const blocked = Math.random() < ARMOR_BLOCK_CHANCE
                            ? Math.min(armor, s.attack) : 0
                        hpLost += s.attack - blocked
                    }
                    ticks++
                }
                hp -= hpLost
                xp += s.xp
                if (Math.random() < lootChance) attack++
                if (Math.random() < lootChance) armor++
                while (xp >= xpToLevel(level)) { xp -= xpToLevel(level); level++; hp = maxHp }
                if (hp <= 0) { died = true; break }
            }

            if (died) { deathsAt[d]++; break }
            state = { hp, maxHp, level, xp, attack, armor, mapsCleared: d + 1 }
        }

        const finalDepth = Math.min(state.mapsCleared, MAX_MAPS)
        depthCount[finalDepth]++
        totalDepth += state.mapsCleared
    }

    return { depthCount, deathsAt, statSamples, totalDepth }
}

// ── Compare configs ──────────────────────────────────────────────────────────
const configs = [
    { label: 'Current (30%)', loot: 0.30 },
    { label: '10% loot', loot: 0.10 },
    { label: '5% loot', loot: 0.05 },
    { label: '3% loot', loot: 0.03 },
]

for (const cfg of configs) {
    const { depthCount, deathsAt, statSamples, totalDepth } = runSimulation(cfg.loot)

    console.log(`\n${'═'.repeat(72)}`)
    console.log(` ${cfg.label}  —  ${RUNS.toLocaleString()} runs`)
    console.log(`${'═'.repeat(72)}`)
    console.log(` Average depth : ${(totalDepth / RUNS).toFixed(1)}   `
        + `Reach map 5: ${((1 - deathsAt.slice(0, 5).reduce((a, v) => a + v, 0) / RUNS) * 100).toFixed(0)}%  `
        + `Reach map 10: ${((1 - deathsAt.slice(0, 10).reduce((a, v) => a + v, 0) / RUNS) * 100).toFixed(0)}%  `
        + `Reach map 20: ${((1 - deathsAt.slice(0, 20).reduce((a, v) => a + v, 0) / RUNS) * 100).toFixed(0)}%`)
    console.log(` Map  Survive%  DieHere%  | AvgAtk  AvgArm  AvgLvl`)
    console.log(`${'─'.repeat(52)}`)
    let alive = RUNS
    for (let d = 0; d <= Math.min(MAX_MAPS, 20); d++) {
        if (alive === 0) break
        const s = statSamples[d]
        const statStr = s.n > 0
            ? ` | ${(s.atk / s.n).toFixed(1).padStart(6)}  ${(s.arm / s.n).toFixed(1).padStart(6)}  ${(s.lvl / s.n).toFixed(1).padStart(6)}`
            : ''
        console.log(` ${String(d).padStart(3)}  ${((alive / RUNS) * 100).toFixed(1).padStart(6)}%  ${((deathsAt[d] / RUNS) * 100).toFixed(1).padStart(6)}%${statStr}`)
        alive -= deathsAt[d]
    }
}
console.log(`\n${'═'.repeat(72)}\n`)
