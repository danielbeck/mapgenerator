import { useState, useEffect, useRef } from 'react'
import { GENERATOR_META } from './map/generators/index.js'
import { computeVisible } from './map/los.js'
import { planPath } from './map/explore.js'
import { placeEnemies, stepEnemiesCloser } from './map/enemies.js'
import { placePotions } from './map/potions.js'
import { resolveCombat, resolvePotionPickup, xpToLevel } from './map/combat.js'
import { updatePassiveState, chooseBehaviorPath } from './ai/behavior.js'
import { findPath } from './map/pathfind.js'

export { xpToLevel }

const META_BY_ID = Object.fromEntries(GENERATOR_META.map(g => [g.id, g]))

const INITIAL_STATS = { name: 'Adventurer', hp: 100, maxHp: 100, level: 1, xp: 0, attack: 5, armor: 0, mapsCleared: 0 }

export function useGameLoop(map, stepsPerSec, { onRequestNextMap, onDeath, complexity = 0.5 }) {
    const stepMs = stepsPerSec > 0 ? Math.round(1000 / stepsPerSec) : Infinity

    const [playerPos, setPlayerPos] = useState(() => ({ ...map.entrance }))
    const [stats, setStats] = useState(INITIAL_STATS)
    const [log, setLog] = useState([{ id: 0, text: 'Your journey begins...' }])

    const mapRef = useRef(map)
    const knownRef = useRef(null)
    const visibleRef = useRef(null)
    const pathRef = useRef([])
    const stepIdxRef = useRef(0)
    const exitKnownRef = useRef(false)
    const doneRef = useRef(false)
    const momentumRef = useRef(null)
    const rafRef = useRef(null)
    const lastTsRef = useRef(null)
    const accumRef = useRef(0)
    const stepMsRef = useRef(stepMs)
    const logIdRef = useRef(1)
    const narrationRef = useRef(null)
    const enemiesRef = useRef([])
    const potionsRef = useRef([])
    const complexityRef = useRef(complexity)
    const statsRef = useRef(INITIAL_STATS)
    const deadFrontiersRef = useRef(new Set()) // frontiers that never reveal new tiles when visited
    const visBufferRef = useRef(null)         // reused Uint8Array for LOS output

    const onRequestNextMapRef = useRef(onRequestNextMap)
    onRequestNextMapRef.current = onRequestNextMap
    const onDeathRef = useRef(onDeath)
    onDeathRef.current = onDeath

    stepMsRef.current = stepMs
    mapRef.current = map
    complexityRef.current = complexity

    useEffect(() => {
        const curMap = map

        const known = new Uint8Array(curMap.width * curMap.height)
        knownRef.current = known
        exitKnownRef.current = false
        doneRef.current = false

        enemiesRef.current = placeEnemies(curMap, Math.random, complexityRef.current, statsRef.current.mapsCleared)
        potionsRef.current = placePotions(curMap, Math.random, complexityRef.current, statsRef.current.mapsCleared)
        deadFrontiersRef.current = new Set()

        // Allocate (or reallocate) the reusable LOS buffer for this map size
        visBufferRef.current = new Uint8Array(curMap.width * curMap.height)

        computeVisible(curMap, curMap.entrance, visBufferRef.current)
        const initVis = visBufferRef.current
        visibleRef.current = initVis
        const exitIdx = curMap.exit.y * curMap.width + curMap.exit.x
        for (let i = 0; i < initVis.length; i++) {
            if (initVis[i]) {
                known[i] = 1
                if (i === exitIdx) exitKnownRef.current = true
            }
        }

        const mapMeta = META_BY_ID[curMap.type]
        setLog(prev => [
            ...prev,
            { id: logIdRef.current++, text: `You enter ${mapMeta ? mapMeta.label : 'the unknown'}.` },
        ])

        momentumRef.current = null
        pathRef.current = planPath(curMap, curMap.entrance, known, exitKnownRef.current, null)
        stepIdxRef.current = 0
        setPlayerPos({ ...curMap.entrance })

        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        lastTsRef.current = null
        accumRef.current = 0

        function tick(ts) {
            if (lastTsRef.current === null) lastTsRef.current = ts
            const elapsed = Math.min(ts - lastTsRef.current, 100)
            lastTsRef.current = ts
            accumRef.current += elapsed

            const steps = Math.floor(accumRef.current / stepMsRef.current)
            if (steps > 0) {
                accumRef.current -= steps * stepMsRef.current

                const curPath = pathRef.current
                const newIdx = Math.min(stepIdxRef.current + steps, curPath.length - 1)
                stepIdxRef.current = newIdx
                const pos = curPath[newIdx]

                // ── LOS + known map ───────────────────────────────────────────
                const m = mapRef.current
                const visBuf = visBufferRef.current
                visBuf.fill(0)
                computeVisible(m, pos, visBuf)
                const vis = visBuf
                visibleRef.current = vis
                const kn = knownRef.current
                const eIdx = m.exit.y * m.width + m.exit.x
                let exitJustRevealed = false
                let newTilesRevealed = 0
                for (let i = 0; i < vis.length; i++) {
                    if (vis[i] && !kn[i]) {
                        newTilesRevealed++
                        if (i === eIdx) exitJustRevealed = true
                        kn[i] = 1
                    }
                }
                if (exitJustRevealed) {
                    exitKnownRef.current = true
                    setLog(prev => [...prev, { id: logIdRef.current++, text: 'You spot the exit!' }])
                }

                const atEnd = newIdx >= curPath.length - 1
                const atExit = pos.x === m.exit.x && pos.y === m.exit.y

                // ── Exit reached ──────────────────────────────────────────────
                if (atEnd && atExit && !doneRef.current) {
                    doneRef.current = true
                    setLog(prev => [
                        ...prev,
                        { id: logIdRef.current++, text: 'You slip through the exit and press onward into the dark.' },
                    ])
                    setStats(prev => {
                        const next = { ...prev, mapsCleared: prev.mapsCleared + 1 }
                        statsRef.current = next
                        return next
                    })
                    setPlayerPos({ ...pos })
                    setTimeout(() => onRequestNextMapRef.current(), 400)
                    return
                }

                // ── Exploration replan ────────────────────────────────────────
                if (atEnd && !doneRef.current) {
                    // If arriving here revealed nothing, this position is a dead
                    // frontier: LOS can't resolve its unknown neighbours from this
                    // side. Blacklist it so the planner never targets it again.
                    if (newTilesRevealed === 0) {
                        deadFrontiersRef.current.add(pos.y * m.width + pos.x)
                    }

                    const cp = pathRef.current
                    if (cp.length >= 2) {
                        const from = cp[Math.max(0, cp.length - 8)]
                        const to = cp[cp.length - 1]
                        const dx = to.x - from.x, dy = to.y - from.y
                        const mag = Math.sqrt(dx * dx + dy * dy) || 1
                        momentumRef.current = { dx: dx / mag, dy: dy / mag }
                    }
                    const newPath = planPath(m, pos, kn, exitKnownRef.current, momentumRef.current, deadFrontiersRef.current)
                    pathRef.current = newPath ?? [pos]
                    stepIdxRef.current = 0
                } else if (exitJustRevealed && !doneRef.current) {
                    // Exit just spotted mid-path — reroute immediately
                    const newPath = planPath(m, pos, kn, true, null)
                    if (newPath && newPath.length > 1) {
                        pathRef.current = newPath
                        stepIdxRef.current = 0
                    }
                }

                // ── Enemy movement ────────────────────────────────────────────
                const moveMessages = stepEnemiesCloser(enemiesRef.current, m, pos, vis)

                // ── Adjacency combat ──────────────────────────────────────────
                const st = statsRef.current
                const combatResult = resolveCombat({
                    enemies: enemiesRef.current, pos,
                    hp: st.hp, xp: st.xp, level: st.level, maxHp: st.maxHp,
                    attack: st.attack, armor: st.armor,
                })
                enemiesRef.current = combatResult.surviving
                let { newHp, newXp, newLevel, newAttack, newArmor } = combatResult

                // ── Potion pickup ─────────────────────────────────────────────
                const potionResult = resolvePotionPickup({
                    potions: potionsRef.current, pos, hp: newHp, maxHp: st.maxHp,
                })
                potionsRef.current = potionResult.remaining
                newHp = potionResult.newHp

                const allMessages = [...moveMessages, ...combatResult.messages, ...potionResult.messages]
                const combatEntries = allMessages.map(text => ({ id: logIdRef.current++, text }))

                // ── Passive state (HP regen) ──────────────────────────────────
                const visibleEnemies = enemiesRef.current.filter(e => vis[e.y * m.width + e.x])
                const visiblePotions = potionsRef.current.filter(p => vis[p.y * m.width + p.x])
                const passive = updatePassiveState({ hp: newHp, maxHp: st.maxHp, visibleEnemies })
                newHp = passive.newHp

                if (combatEntries.length > 0) setLog(prev => [...prev, ...combatEntries])

                // ── Death check ───────────────────────────────────────────────
                if (newHp <= 0) {
                    doneRef.current = true
                    setStats(prev => { const next = { ...prev, hp: 0, xp: newXp, level: newLevel }; statsRef.current = next; return next })
                    setLog(prev => [...prev, { id: logIdRef.current++, text: 'You have been slain. Your journey ends here.' }])
                    setPlayerPos({ ...pos })
                    setTimeout(() => {
                        setStats(INITIAL_STATS)
                        statsRef.current = INITIAL_STATS
                        setLog([{ id: 0, text: 'Your journey begins...' }])
                        logIdRef.current = 1
                        onDeathRef.current()
                    }, 1500)
                    return
                }

                if (Math.ceil(newHp) !== Math.ceil(st.hp) || newXp !== st.xp || newLevel !== st.level
                    || newAttack !== st.attack || newArmor !== st.armor) {
                    setStats(prev => {
                        const next = { ...prev, hp: newHp, xp: newXp, level: newLevel, attack: newAttack, armor: newArmor }
                        statsRef.current = next
                        return next
                    })
                }

                // ── Behavior path override ────────────────────────────────────
                const behavior = chooseBehaviorPath({
                    pos, map: m, known: kn,
                    hp: newHp, maxHp: st.maxHp,
                    visibleEnemies, visiblePotions,
                    exitKnown: exitKnownRef.current,
                })
                if (!doneRef.current && behavior.path !== null) {
                    pathRef.current = behavior.path
                    stepIdxRef.current = 0
                }

                setPlayerPos({ ...pos })
            }

            rafRef.current = requestAnimationFrame(tick)
        }

        rafRef.current = requestAnimationFrame(tick)
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (narrationRef.current) {
            narrationRef.current.scrollTop = narrationRef.current.scrollHeight
        }
    }, [log])

    return { playerPos, knownRef, visibleRef, enemiesRef, potionsRef, log, stats, narrationRef }
}
