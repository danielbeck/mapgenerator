import { useState, useEffect, useRef } from 'react'
import { GENERATOR_META } from './map/generators/index.js'
import { computeVisible } from './map/los.js'
import { planPath } from './map/explore.js'
import { placeEnemies, stepEnemiesCloser } from './map/enemies.js'
import { placePotions } from './map/potions.js'
import { resolveCombat, resolvePotionPickup, resolveMeleeUntilFlee, xpToLevel } from './map/combat.js'
import { updatePassiveState, chooseBehaviorPath } from './ai/behavior.js'
import { findPath } from './map/pathfind.js'
import { TILE } from './map/tiles.js'

export { xpToLevel }

const META_BY_ID = Object.fromEntries(GENERATOR_META.map(g => [g.id, g]))

const INITIAL_STATS = { name: 'Adventurer', hp: 100, maxHp: 100, level: 1, xp: 0, attack: 5, armor: 0, mapsCleared: 0 }

export function useGameLoop(map, stepsPerSec, { onRequestNextMap, onDeath, complexity = 0.5 }) {
    const stepMs = stepsPerSec > 0 ? Math.round(1000 / stepsPerSec) : Infinity

    const [playerPos, setPlayerPos] = useState(() => ({ ...map.entrance }))
    const [stats, setStats] = useState(INITIAL_STATS)
    const [log, setLog] = useState([{ id: 0, text: 'Your journey begins...' }])

    const playerPosRef = useRef({ ...map.entrance })  // authoritative pos for WASD handler
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
        playerPosRef.current = { ...curMap.entrance }
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
                    playerPosRef.current = { ...pos }
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
                    playerPosRef.current = { ...pos }
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

                playerPosRef.current = { ...pos }
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

    // ── WASD manual movement (active only when speed = 0 / paused) ────────────
    useEffect(() => {
        const DIRS = {
            w: { dx: 0, dy: -1 }, arrowup: { dx: 0, dy: -1 },
            a: { dx: -1, dy: 0 }, arrowleft: { dx: -1, dy: 0 },
            s: { dx: 0, dy: 1 },  arrowdown: { dx: 0, dy: 1 },
            d: { dx: 1, dy: 0 },  arrowright: { dx: 1, dy: 0 },
        }

        function handleKeyDown(e) {
            if (stepMsRef.current !== Infinity) return  // auto-mode running; ignore
            if (doneRef.current) return
            const dir = DIRS[e.key.toLowerCase()]
            if (!dir) return
            e.preventDefault()

            const m = mapRef.current
            const pos = playerPosRef.current
            const nx = pos.x + dir.dx, ny = pos.y + dir.dy
            if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) return
            if (m.tiles[ny * m.width + nx] === TILE.WALL) return

            const st = statsRef.current
            let newHp = st.hp, newXp = st.xp, newLevel = st.level
            let newAttack = st.attack, newArmor = st.armor
            const allMessages = []
            let entryPos = { x: nx, y: ny }  // where player ends up

            // ── Enemy movement (step toward player before combat) ─────────────
            // Use current pos as the player location enemies move toward
            const preMoveVis = visBufferRef.current
            preMoveVis.fill(0)
            computeVisible(m, { x: nx, y: ny }, preMoveVis)
            const moveMessages = stepEnemiesCloser(enemiesRef.current, m, { x: nx, y: ny }, preMoveVis)
            allMessages.push(...moveMessages)

            // ── Combat if an enemy occupies the target tile ───────────────────
            const enemyAtTarget = enemiesRef.current.find(en => en.x === nx && en.y === ny)
            if (enemyAtTarget) {
                const result = resolveMeleeUntilFlee({
                    enemy: enemyAtTarget,
                    hp: newHp, maxHp: st.maxHp,
                    xp: newXp, level: newLevel,
                    attack: newAttack, armor: newArmor,
                })
                allMessages.push(...result.messages)
                newHp = result.newHp; newXp = result.newXp; newLevel = result.newLevel
                newAttack = result.newAttack; newArmor = result.newArmor

                if (result.enemyDied) {
                    enemiesRef.current = enemiesRef.current.filter(en => en !== enemyAtTarget)
                } else {
                    entryPos = pos  // enemy fled or player stayed in place
                }

                if (result.playerDied) {
                    doneRef.current = true
                    allMessages.push('You have been slain. Your journey ends here.')
                    setLog(prev => [...prev, ...allMessages.map(text => ({ id: logIdRef.current++, text }))])
                    setStats(prev => { const next = { ...prev, hp: 0, xp: newXp, level: newLevel }; statsRef.current = next; return next })
                    playerPosRef.current = pos
                    setPlayerPos({ ...pos })
                    setTimeout(() => {
                        setStats(INITIAL_STATS); statsRef.current = INITIAL_STATS
                        setLog([{ id: 0, text: 'Your journey begins...' }]); logIdRef.current = 1
                        onDeathRef.current()
                    }, 1500)
                    return
                }
            }

            // ── LOS + known map ───────────────────────────────────────────────
            const visBuf = visBufferRef.current
            visBuf.fill(0)
            computeVisible(m, entryPos, visBuf)
            visibleRef.current = visBuf
            const kn = knownRef.current
            const eIdx = m.exit.y * m.width + m.exit.x
            let exitJustRevealed = false
            for (let i = 0; i < visBuf.length; i++) {
                if (visBuf[i] && !kn[i]) {
                    kn[i] = 1
                    if (i === eIdx) exitJustRevealed = true
                }
            }
            if (exitJustRevealed) {
                exitKnownRef.current = true
                allMessages.unshift('You spot the exit!')
            }

            // ── Potion pickup ─────────────────────────────────────────────────
            const potionResult = resolvePotionPickup({ potions: potionsRef.current, pos: entryPos, hp: newHp, maxHp: st.maxHp })
            potionsRef.current = potionResult.remaining
            newHp = potionResult.newHp
            allMessages.push(...potionResult.messages)

            // ── Passive regen (one step) ──────────────────────────────────────
            const visibleEnemies = enemiesRef.current.filter(en => visBuf[en.y * m.width + en.x])
            newHp = updatePassiveState({ hp: newHp, maxHp: st.maxHp, visibleEnemies }).newHp

            // ── Exit check ────────────────────────────────────────────────────
            if (!doneRef.current && entryPos.x === m.exit.x && entryPos.y === m.exit.y) {
                doneRef.current = true
                allMessages.push('You slip through the exit and press onward into the dark.')
                setLog(prev => [...prev, ...allMessages.map(text => ({ id: logIdRef.current++, text }))])
                setStats(prev => { const next = { ...prev, mapsCleared: prev.mapsCleared + 1 }; statsRef.current = next; return next })
                playerPosRef.current = entryPos
                setPlayerPos({ ...entryPos })
                pathRef.current = [entryPos]; stepIdxRef.current = 0
                setTimeout(() => onRequestNextMapRef.current(), 400)
                return
            }

            if (allMessages.length > 0)
                setLog(prev => [...prev, ...allMessages.map(text => ({ id: logIdRef.current++, text }))])
            setStats(prev => {
                const next = { ...prev, hp: newHp, xp: newXp, level: newLevel, attack: newAttack, armor: newArmor }
                statsRef.current = next
                return next
            })
            playerPosRef.current = entryPos
            setPlayerPos({ ...entryPos })
            // Anchor the auto-planner to the new position when unpaused
            pathRef.current = [entryPos]
            stepIdxRef.current = 0
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return { playerPos, knownRef, visibleRef, enemiesRef, potionsRef, log, stats, narrationRef }
}
