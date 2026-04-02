import { useState, useEffect, useRef } from 'react'
import { generateMap, GENERATOR_META } from './map/generators/index.js'
import { TILE_COLOR, TILE_COLOR_BRIGHT, TILE_COLOR_FOG } from './tileColors.js'
import { computeVisible } from './map/los.js'
import { planPath } from './map/explore.js'
import './App.css'

const MAP_WIDTH = 128
const MAP_HEIGHT = 128
const PLAYER_COLOR = '#f0e060'
const DEFAULT_STEPS_PER_SEC = 25

function App() {
  const [typeId, setTypeId] = useState(GENERATOR_META[0].id)
  const [complexity, setComplexity] = useState(0.5)
  const [stepsPerSec, setStepsPerSec] = useState(DEFAULT_STEPS_PER_SEC)
  const stepMs = Math.round(1000 / stepsPerSec)

  // `map` is React state so changing it restarts the rAF effect below
  const [map, setMap] = useState(() => generateMap(GENERATOR_META[0].id, MAP_WIDTH, MAP_HEIGHT, 0.5))

  // Player position is React state (triggers re-render each step)
  const [playerPos, setPlayerPos] = useState(() => ({ ...map.entrance }))

  // ── All animation / fog-of-war logic lives in refs ──────────────────────
  const mapRef = useRef(map)    // current map (readable from rAF without stale closure)
  const knownRef = useRef(null)   // Uint8Array — has tile ever been seen?
  const visibleRef = useRef(null)   // Uint8Array — currently in LOS (recomputed per step)
  const pathRef = useRef([])     // current walk path
  const stepIdxRef = useRef(0)      // position along pathRef
  const exitKnownRef = useRef(false)  // has the exit tile been spotted yet?
  const doneRef = useRef(false)  // true while waiting for the next map to load
  const momentumRef = useRef(null)   // {dx,dy} unit vector of recent travel direction
  const rafRef = useRef(null)
  const lastTsRef = useRef(null)
  const accumRef = useRef(0)
  const stepMsRef = useRef(stepMs)

  // Keep speed and map refs in sync every render (no effect needed)
  stepMsRef.current = stepMs
  mapRef.current = map

  useEffect(() => {
    const curMap = map

    // ── Reset fog-of-war ───────────────────────────────────────────────────
    const known = new Uint8Array(curMap.width * curMap.height)
    knownRef.current = known
    exitKnownRef.current = false
    doneRef.current = false

    // Reveal tiles visible from the entrance
    const initVis = computeVisible(curMap, curMap.entrance)
    visibleRef.current = initVis
    const exitIdx = curMap.exit.y * curMap.width + curMap.exit.x
    for (let i = 0; i < initVis.length; i++) {
      if (initVis[i]) {
        known[i] = 1
        if (i === exitIdx) exitKnownRef.current = true
      }
    }

    // ── Plan first path ────────────────────────────────────────────────────
    momentumRef.current = null
    pathRef.current = planPath(curMap, curMap.entrance, known, exitKnownRef.current, null)
    stepIdxRef.current = 0
    setPlayerPos({ ...curMap.entrance })

    // ── rAF loop ───────────────────────────────────────────────────────────
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    lastTsRef.current = null
    accumRef.current = 0

    function tick(ts) {
      if (lastTsRef.current === null) lastTsRef.current = ts
      const elapsed = Math.min(ts - lastTsRef.current, 100) // guard against tab focus gaps
      lastTsRef.current = ts
      accumRef.current += elapsed

      const steps = Math.floor(accumRef.current / stepMsRef.current)
      if (steps > 0) {
        accumRef.current -= steps * stepMsRef.current

        const curPath = pathRef.current
        const newIdx = Math.min(stepIdxRef.current + steps, curPath.length - 1)
        stepIdxRef.current = newIdx
        const pos = curPath[newIdx]

        // ── Update LOS + known ─────────────────────────────────────────────
        const m = mapRef.current
        const vis = computeVisible(m, pos)
        visibleRef.current = vis
        const kn = knownRef.current
        const eIdx = m.exit.y * m.width + m.exit.x
        let exitJustRevealed = false
        for (let i = 0; i < vis.length; i++) {
          if (vis[i]) {
            if (!kn[i] && i === eIdx) exitJustRevealed = true
            kn[i] = 1
          }
        }
        if (exitJustRevealed) exitKnownRef.current = true

        // ── Decide next action ─────────────────────────────────────────────
        const atEnd = newIdx >= curPath.length - 1
        const atExit = pos.x === m.exit.x && pos.y === m.exit.y

        if (atEnd && atExit && !doneRef.current) {
          // Reached the exit — load a random new map after a pause
          doneRef.current = true
          setPlayerPos({ ...pos })
          setTimeout(() => {
            const meta = GENERATOR_META[Math.floor(Math.random() * GENERATOR_META.length)]
            const c = Math.round(Math.random() * 100) / 100
            setTypeId(meta.id)
            setComplexity(c)
            setMap(generateMap(meta.id, MAP_WIDTH, MAP_HEIGHT, c))
          }, 400)
          return  // stop rAF; useEffect will restart it when map state changes
        }

        if (atEnd && !doneRef.current) {
          // Update momentum from the path we just completed
          const cp = pathRef.current
          if (cp.length >= 2) {
            const from = cp[Math.max(0, cp.length - 8)]
            const to = cp[cp.length - 1]
            const dx = to.x - from.x, dy = to.y - from.y
            const mag = Math.sqrt(dx * dx + dy * dy) || 1
            momentumRef.current = { dx: dx / mag, dy: dy / mag }
          }
          // Path exhausted and not at exit — replan (new frontier or exit)
          pathRef.current = planPath(m, pos, kn, exitKnownRef.current, momentumRef.current)
          stepIdxRef.current = 0
        } else if (exitJustRevealed && !doneRef.current) {
          // Exit just became visible mid-path — replan toward exit immediately
          const newPath = planPath(m, pos, kn, true, null)
          if (newPath && newPath.length > 1) {
            pathRef.current = newPath
            stepIdxRef.current = 0
          }
        }

        setPlayerPos({ ...pos })
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Control handlers ──────────────────────────────────────────────────────
  function handleTypeChange(e) {
    const id = e.target.value
    setTypeId(id)
    setMap(generateMap(id, MAP_WIDTH, MAP_HEIGHT, complexity))
  }

  function handleComplexityChange(e) {
    setComplexity(Number(e.target.value))
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const playerIdx = playerPos.y * MAP_WIDTH + playerPos.x
  const knownArr = knownRef.current
  const visArr = visibleRef.current

  return (
    <div id="map-container">
      <div id="controls">
        <select value={typeId} onChange={handleTypeChange}>
          {GENERATOR_META.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
        <label id="complexity-label">
          Complexity
          <input
            type="range"
            min="0" max="1" step="0.01"
            value={complexity}
            onChange={handleComplexityChange}
          />
          <span>{Math.round(complexity * 100)}</span>
        </label>
        <label id="speed-label">
          Speed
          <input
            type="range"
            min="5" max="60" step="1"
            value={stepsPerSec}
            onChange={e => setStepsPerSec(Number(e.target.value))}
          />
        </label>
        <button onClick={() => setMap(generateMap(typeId, MAP_WIDTH, MAP_HEIGHT, complexity))}>Regenerate</button>
      </div>
      <div
        id="map-grid"
        style={{ gridTemplateColumns: `repeat(${MAP_WIDTH}, 1fr)` }}
      >
        {Array.from(map.tiles).map((tile, i) => {
          if (i === playerIdx) {
            return <div key={i} className="cell" style={{ background: PLAYER_COLOR }} />
          }
          const isVisible = visArr && visArr[i]
          const isKnown = knownArr && knownArr[i]
          const bg = isVisible ? TILE_COLOR_BRIGHT[tile]
            : isKnown ? TILE_COLOR[tile]
              : TILE_COLOR_FOG[tile]
          return <div key={i} className="cell" style={{ background: bg }} />
        })}
      </div>
    </div>
  )
}

export default App
