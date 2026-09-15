# Sokoban Trainer

A browser version of the Sokoban levels from the NYU CS-GY6613 Sokoban environment, built as a
static site for CMSC 221. Students can play all 121 levels, compare their move count against the
A* agent's, and watch the search solve a level step by step.

No build step, no dependencies, no server — it is plain HTML, CSS, and JavaScript. Open
`index.html` in a browser and it runs.

## Publishing on GitHub Pages

1. Create a new repository and push the contents of this folder to its default branch.

   ```bash
   git init
   git add .
   git commit -m "Sokoban trainer"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. In the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, pick
   `main` and the `/ (root)` folder, and save.

3. A minute later the site is live at `https://<you>.github.io/<repo>/`.

The `.nojekyll` file tells GitHub Pages to serve the folder as-is rather than running it through
Jekyll. Leave it in place.

## What's in here

| File | |
|---|---|
| `index.html` | the page |
| `style.css` | styles, with light and dark palettes |
| `sokoban.js` | game engine + A* solver, ported from the Python environment |
| `levels.js` | all 121 levels with their A* solution stats (generated) |
| `app.js` | rendering, input, level picker, progress |
| `tools/` | the generator and a browser smoke test — not needed to serve the site |

## Controls

Arrow keys or `WASD` to move, `U` to undo, `R` to reset, `N` / `P` for next and previous level,
`H` for a hint. On a phone, swipe the board or use the on-screen pad.

## The port

`sokoban.js` follows the Python source closely so that what students see here matches what their
own agents do:

- `State` mirrors `sokoban.py` — `stringInitialize`, `clone`, `checkWin`, and an `update(dx, dy)`
  that returns `true` only when a crate was pushed.
- `getHash`, `getHeuristic`, `initializeDeadlocks`, `checkDeadlock`, and `Node` mirror `helper.py`.
  The heuristic is the same greedy nearest-goal Manhattan matching, and deadlock detection is the
  same corner-plus-wall-run scan.
- `solveAStar` mirrors `AStarAgent.getSolution` in `agent_master.py`: weighted A* with
  `f = h + 0.5·g`, a visited set keyed by state hash, and the `bestNode` fallback when the
  iteration budget runs out.

The one deliberate difference is the iteration cap. The Python default is 3000; this uses 200,000
so that mid-game hints from awkward positions still return an answer. Nothing here needs it — the
hardest level in the set is found in about 8,800 nodes.

## Regenerating `levels.js`

`levels.js` is generated, not hand-written. `tools/levels-source.json` holds the raw maps as read
from `assets/main_levels/` and `assets/gen_levels/` in the Python repo. To rebuild:

```bash
node tools/build-levels.js
```

This solves every level with the ported A*, **replays each solution through the engine to confirm
it actually reaches a win state**, and writes `levels.js` with per-level `moves`, `pushes`,
`nodes`, and a difficulty `tier`. All 121 levels currently solve and verify in about 200 ms total.

To change the difficulty buckets, edit `score()` and `tier()` in that script. Difficulty is
`moves + 4 × (crates − 1)`, so a short level with four crates ranks above a long one with a single
crate.

## Testing

`tools/smoke-test.js` drives the page in a headless browser (Playwright) and checks rendering,
keyboard play through to a win, undo, reset, hints, A* playback, the level picker, filters, the
theme toggle, and mobile layout.

```bash
npm install playwright
node tools/smoke-test.js
```

## Credits

Levels, map format, and game rules come from the Sokoban environment used in NYU's CS-GY6613
Artificial Intelligence course. The JavaScript port and this interface were written for CMSC 221.
