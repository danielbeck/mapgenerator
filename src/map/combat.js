import { ENEMY_STATS, article } from './enemies.js'
import { POTION_HEAL } from './potions.js'

// XP awarded per kill — read from ENEMY_STATS.xp (falls back to 10)

export const FLEE_THRESHOLD = 0.25  // enemy flees below this fraction of its max HP

// XP required to reach level N+1
export function xpToLevel(level) { return 100 + (level - 1) * 50 }

/**
 * Resolve one tick of adjacency combat.
 * Mutates enemy.hp in place (enemies are mutable objects).
 * Returns { surviving, newHp, newXp, newLevel, messages }
 */
export function resolveCombat({ enemies, pos, hp, xp, level, maxHp, attack, armor }) {
    let newHp = hp
    let newXp = xp
    let newLevel = level
    let newAttack = attack
    let newArmor = armor
    const messages = []
    const surviving = []

    for (const enemy of enemies) {
        const adj = Math.abs(enemy.x - pos.x) <= 1 && Math.abs(enemy.y - pos.y) <= 1
        if (adj) {
            const prevEnemyHp = enemy.hp
            enemy.hp -= attack
            const artStrike = enemy.introduced ? 'the' : `${article(enemy.kind).toLowerCase()}`
            enemy.introduced = true
            if (enemy.hp <= 0) {
                messages.push(`You strike ${artStrike} ${enemy.kind} for ${prevEnemyHp} damage. It falls!`)
                const xpGain = ENEMY_STATS[enemy.kind]?.xp ?? 10
                newXp += xpGain
                messages.push(`You slay the ${enemy.kind}! (+${xpGain} XP)`)
                while (newXp >= xpToLevel(newLevel)) {
                    newXp -= xpToLevel(newLevel)
                    newLevel++
                    newHp = maxHp
                    messages.push(`Level up! You are now level ${newLevel}. Health restored!`)
                }
                // Loot drop: ~5% chance each for weapon/armor upgrade
                if (Math.random() < 0.05) {
                    newAttack++
                    messages.push(`You find a better weapon! (Attack: ${newAttack})`)
                }
                if (Math.random() < 0.05) {
                    newArmor++
                    messages.push(`You find better armor! (Armor: ${newArmor})`)
                }
                continue
            }
            messages.push(`You strike ${artStrike} ${enemy.kind} for ${attack} damage. (${Math.max(0, enemy.hp)}/${ENEMY_STATS[enemy.kind].maxHp} HP)`)
            const rawDmg = ENEMY_STATS[enemy.kind].attack
            const blocked = Math.random() < 0.8 ? Math.min(armor, rawDmg) : 0
            const finalDmg = rawDmg - blocked
            newHp = newHp - finalDmg
            const blockNote = blocked > 0 ? ` (${blocked} blocked by armor)` : ''
            messages.push(`The ${enemy.kind} strikes you for ${finalDmg} damage${blockNote}! (${Math.max(0, Math.ceil(newHp))}/${maxHp} HP)`)
        }
        surviving.push(enemy)
    }

    return { surviving, newHp, newXp, newLevel, newAttack, newArmor, messages }
}

/**
 * Resolve potion pickup at current position.
 * Returns { remaining, newHp, messages }
 */
export function resolvePotionPickup({ potions, pos, hp, maxHp }) {
    let newHp = hp
    const messages = []
    const remaining = potions.filter(p => {
        if (p.x === pos.x && p.y === pos.y && newHp < maxHp) {
            const before = newHp
            newHp = Math.min(maxHp, newHp + POTION_HEAL)
            messages.push(`You drink a health potion! +${Math.round(newHp - before)} HP (${Math.ceil(newHp)}/${maxHp}).`)
            return false
        }
        return true
    })
    return { remaining, newHp, messages }
}

/**
 * Manual-combat mode: fight a single enemy round-by-round until it dies or
 * drops below the flee threshold. Used for WASD player control.
 * Mutates enemy.hp / enemy.introduced / enemy.wasFleeing in place.
 * Returns { enemyDied, playerDied, messages, newHp, newXp, newLevel, newAttack, newArmor }
 */
export function resolveMeleeUntilFlee({ enemy, hp, maxHp, xp, level, attack, armor }) {
    let newHp = hp, newXp = xp, newLevel = level
    let newAttack = attack, newArmor = armor
    const messages = []
    const stats = ENEMY_STATS[enemy.kind]

    while (enemy.hp > 0) {
        // ── Player strikes ────────────────────────────────────────────────
        const prevHp = enemy.hp
        enemy.hp -= attack
        const artS = enemy.introduced ? 'the' : `${article(enemy.kind).toLowerCase()}`

        if (enemy.hp <= 0) {
            messages.push(`You strike ${artS} ${enemy.kind} for ${prevHp} damage. It falls!`)
            const xpGain = stats.xp ?? 10
            newXp += xpGain
            messages.push(`You slay the ${enemy.kind}! (+${xpGain} XP)`)
            while (newXp >= xpToLevel(newLevel)) {
                newXp -= xpToLevel(newLevel)
                newLevel++
                newHp = maxHp
                messages.push(`Level up! You are now level ${newLevel}. Health restored!`)
            }
            if (Math.random() < 0.05) { newAttack++; messages.push(`You find a better weapon! (Attack: ${newAttack})`) }
            if (Math.random() < 0.05) { newArmor++; messages.push(`You find better armor! (Armor: ${newArmor})`) }
            return { enemyDied: true, playerDied: false, messages, newHp, newXp, newLevel, newAttack, newArmor }
        }

        // ── Enemy flees before retaliating ────────────────────────────────
        messages.push(`You strike ${artS} ${enemy.kind} for ${attack} damage. (${Math.max(0, enemy.hp)}/${stats.maxHp} HP)`)
        if (enemy.hp / stats.maxHp < FLEE_THRESHOLD) {
            if (!enemy.wasFleeing) messages.push(`The ${enemy.kind} turns to flee!`)
            enemy.wasFleeing = true
            enemy.introduced = true
            return { enemyDied: false, playerDied: false, messages, newHp, newXp, newLevel, newAttack, newArmor }
        }

        // ── Enemy retaliates ──────────────────────────────────────────────
        const a = enemy.introduced ? 'The' : article(enemy.kind)
        enemy.introduced = true
        const rawDmg = stats.attack
        const blocked = Math.random() < 0.8 ? Math.min(armor, rawDmg) : 0
        const finalDmg = rawDmg - blocked
        newHp -= finalDmg
        const blockNote = blocked > 0 ? ` (${blocked} blocked by armor)` : ''
        messages.push(`${a} ${enemy.kind} strikes you for ${finalDmg} damage${blockNote}! (${Math.max(0, Math.ceil(newHp))}/${maxHp} HP)`)

        if (newHp <= 0) {
            return { enemyDied: false, playerDied: true, messages, newHp, newXp, newLevel, newAttack, newArmor }
        }
    }

    return { enemyDied: true, playerDied: false, messages, newHp, newXp, newLevel, newAttack, newArmor }
}
