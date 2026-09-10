# Map Generator Adventure

A toy self-playing dungeon crawl built with React and Vite.

Each run drops an AI-controlled adventurer into a generated dungeon-like map. The character explores, fights enemies, picks up potions, levels up, and moves to the next map after finding the exit.

## What this app does

- Generates procedural maps (128 x 128) using a variety of generator styles (see `src/map/generators/*`).
- Simulates line-of-sight exploration and fog-of-war style discovery.
- Runs a continuous movement, combat, and progression loop.
- Uses A* pathfinding plus exploration heuristics to decide routes.
- Applies behavior-based priorities that change with health.
- Tracks progression stats such as HP, level, XP, attack, armor, and maps cleared.
- Automatically transitions to a new random map after reaching the exit.

## Technical highlights

- Multi-strategy map generation:
	The app includes many map generators (open regions, labyrinths, street-like layouts, caves, and more) behind a shared registry and metadata system, making generator types easy to add and swap.
- Frontier-based exploration planner:
	Instead of wandering randomly, exploration targets frontier tiles (known walkable tiles adjacent to unknown walkable tiles), which tends to reveal new space efficiently.
- Momentum-biased route scoring:
	Frontier candidates are scored by path proximity and directional momentum so the explorer commits to a direction rather than thrashing between symmetric choices.
- Dead-frontier blacklisting:
	If reaching a frontier reveals no new tiles, that tile is marked as dead so the planner does not repeatedly retarget unproductive edges.
- Loop detection and recovery:
	The game loop detects short ABAB movement oscillations and injects a one-step escape maneuver toward novel nearby space, reducing rare two-point lockups.
- Low-allocation visibility updates:
	Line-of-sight uses a reusable typed-array buffer (`Uint8Array`) each tick, minimizing per-frame allocations and reducing GC pressure during high-speed simulation.
- Layered behavior policy:
	Combat/exploration intent is separated from path planning. At high HP, the character prefers fighting before exiting; at lower HP, it prefers potion routes before risky engagements.

## How to use

### 1. Install and start

Requirements:

- Node.js 18+
- npm

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Then open the local URL shown in the terminal (typically http://localhost:5173).

### 2. In-app controls

- Map type dropdown: choose a specific generator style.
- Complexity slider: adjust map complexity before generating a map.
- Speed slider: 1 to 60 runs the automatic game loop; 0 pauses automation and enables manual movement.
- Regenerate button: rebuilds the current map type with current complexity.

### 3. Manual movement mode

When speed is set to 0, move with:

- W A S D
- Arrow keys

Manual mode is useful for inspecting map layouts and testing combat or visibility behavior step by step.

## Available scripts

```bash
npm run dev      # Start dev server
npm run build    # Create production build
npm run preview  # Preview production build locally
npm run lint     # Run ESLint
```

