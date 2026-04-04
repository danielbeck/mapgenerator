import { useState } from 'react'
import { generateMap, GENERATOR_META } from './map/generators/index.js'
import { TILE_COLOR, TILE_COLOR_BRIGHT, TILE_COLOR_FOG } from './tileColors.js'
import { ENEMY_COLOR } from './map/enemies.js'
import { POTION_COLOR } from './map/potions.js'
import { useGameLoop, xpToLevel } from './useGameLoop.js'
import './App.css'

const MAP_WIDTH = 128
const MAP_HEIGHT = 128
const PLAYER_COLOR = '#f0e060'
const DEFAULT_STEPS_PER_SEC = 25

function App() {
  const [typeId, setTypeId] = useState(GENERATOR_META[0].id)
  const [complexity, setComplexity] = useState(0.5)
  const [stepsPerSec, setStepsPerSec] = useState(DEFAULT_STEPS_PER_SEC)
  const [map, setMap] = useState(() => generateMap(GENERATOR_META[0].id, MAP_WIDTH, MAP_HEIGHT, 0.5))

  // Called by the game loop when the character exits a map
  function handleRequestNextMap() {
    const meta = GENERATOR_META[Math.floor(Math.random() * GENERATOR_META.length)]
    const c = Math.round(Math.random() * 100) / 100
    setTypeId(meta.id)
    setComplexity(c)
    setMap(generateMap(meta.id, MAP_WIDTH, MAP_HEIGHT, c))
  }

  // Called by the game loop after death pause (stats already reset inside hook)
  function handleDeath() {
    const meta = GENERATOR_META[Math.floor(Math.random() * GENERATOR_META.length)]
    const c = Math.round(Math.random() * 100) / 100
    setTypeId(meta.id)
    setComplexity(c)
    setMap(generateMap(meta.id, MAP_WIDTH, MAP_HEIGHT, c))
  }

  const { playerPos, knownRef, visibleRef, enemiesRef, potionsRef, log, stats, narrationRef } =
    useGameLoop(map, stepsPerSec, { onRequestNextMap: handleRequestNextMap, onDeath: handleDeath, complexity })

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
  const hpPct = Math.round((stats.hp / stats.maxHp) * 100)
  const xpNeeded = xpToLevel(stats.level)
  const xpPct = Math.min(100, Math.round((stats.xp / xpNeeded) * 100))
  const enemyIdxSet = new Set(
    (enemiesRef.current ?? []).map(e => e.y * MAP_WIDTH + e.x)
  )
  const potionIdxSet = new Set(
    (potionsRef.current ?? []).map(p => p.y * MAP_WIDTH + p.x)
  )

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
            min="0" max="60" step="1"
            value={stepsPerSec}
            onChange={e => setStepsPerSec(Number(e.target.value))}
          />
        </label>
        <button onClick={() => setMap(generateMap(typeId, MAP_WIDTH, MAP_HEIGHT, complexity))}>Regenerate</button>
      </div>

      <div id="main-area">
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
            const isEnemy = isVisible && enemyIdxSet.has(i)
            const isPotion = isVisible && potionIdxSet.has(i)
            const bg = isEnemy ? ENEMY_COLOR
              : isPotion ? POTION_COLOR
                : isVisible ? TILE_COLOR_BRIGHT[tile]
                  : isKnown ? TILE_COLOR[tile]
                    : TILE_COLOR_FOG[tile]
            const cellStyle = isEnemy
              ? { background: bg }
              : isPotion
                ? { background: bg, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.9)' }
                : { background: bg }
            return <div key={i} className="cell" style={cellStyle} />
          })}
        </div>

        <div id="side-panels">

          <div id="stats-panel">
            <div className="panel-title">Statistics</div>
            <div id="stats-content">
              <div id="stats-name">{stats.name}</div>
              <div className="stat-row">
                <span className="stat-label">HP</span>
                <div className="hp-bar-track">
                  <div className="hp-bar-fill" style={{ width: `${hpPct}%` }} />
                </div>
                <span className="stat-value">{Math.ceil(stats.hp)} / {stats.maxHp}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Level</span>
                <span className="stat-value">{stats.level}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">XP</span>
                <div className="xp-bar-track">
                  <div className="xp-bar-fill" style={{ width: `${xpPct}%` }} />
                </div>
                <span className="stat-value">{stats.xp} / {xpNeeded}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Maps cleared</span>
                <span className="stat-value">{stats.mapsCleared}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Attack</span>
                <span className="stat-value">{stats.attack}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Armor</span>
                <span className="stat-value">{stats.armor}</span>
              </div>
            </div>
          </div>

          <div id="narration-panel">
            <div className="panel-title">Journal</div>
            <div id="narration-log" ref={narrationRef}>
              {log.map(entry => (
                <p key={entry.id} className="log-entry">{entry.text}</p>
              ))}
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}

export default App

