import { ENEMY_STATS, article } from './enemies.js'
import { POTION_HEAL } from './potions.js'

export const PLAYER_ATTACK = 5  // base damage; improves via weapon drops

// XP awarded per kill — read from ENEMY_STATS.xp (falls back to 10)

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
            enemy.hp -= attack
            if (enemy.hp <= 0) {
                const xpGain = ENEMY_STATS[enemy.kind]?.xp ?? 10
                newXp += xpGain
                messages.push(`You slay the ${enemy.kind}! (+${xpGain} XP)`)
                while (newXp >= xpToLevel(newLevel)) {
                    newXp -= xpToLevel(newLevel)
                    newLevel++
                    newHp = maxHp
                    messages.push(`Level up! You are now level ${newLevel}. Health restored!`)
                }
                // Loot drop: ~30% chance each for weapon/armor upgrade
                if (Math.random() < 0.30) {
                    newAttack++
                    messages.push(`You find a better weapon! (Attack: ${newAttack})`)
                }
                if (Math.random() < 0.30) {
                    newArmor++
                    messages.push(`You find better armor! (Armor: ${newArmor})`)
                }
                continue
            }
            const art = enemy.introduced ? 'The' : article(enemy.kind)
            enemy.introduced = true
            const rawDmg = ENEMY_STATS[enemy.kind].attack
            const blocked = Math.random() < 0.8 ? Math.min(armor, rawDmg) : 0
            const finalDmg = rawDmg - blocked
            newHp = newHp - finalDmg
            const blockNote = blocked > 0 ? ` (${blocked} blocked by armor)` : ''
            messages.push(`${art} ${enemy.kind} strikes you for ${finalDmg} damage${blockNote}! (${Math.max(0, Math.ceil(newHp))}/${maxHp} HP)`)
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
        if (p.x === pos.x && p.y === pos.y && newHp + POTION_HEAL <= maxHp) {
            const before = newHp
            newHp = Math.min(maxHp, newHp + POTION_HEAL)
            messages.push(`You drink a health potion! +${Math.round(newHp - before)} HP (${Math.ceil(newHp)}/${maxHp}).`)
            return false
        }
        return true
    })
    return { remaining, newHp, messages }
}
