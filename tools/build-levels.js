/* Build script (not shipped to the site).
 * Reads _raw_levels.json, solves every level with the ported A* agent,
 * verifies the solution actually wins when replayed through the engine,
 * and writes levels.js with per-level metadata.
 *
 *   node tools/build-levels.js
 */
const fs = require('fs');
const path = require('path');
const S = require('../sokoban.js');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'levels-source.json'), 'utf8'));

function analyze(lines) {
  const state = S.fromLines(lines);
  const t0 = Date.now();
  const res = S.solveAStar(state, 200000);
  const ms = Date.now() - t0;

  // Replay the solution through a fresh state to prove it really wins.
  const replay = S.fromLines(lines);
  let pushes = 0;
  for (const a of res.actions) if (replay.update(a.x, a.y)) pushes++;
  const verified = replay.checkWin();

  return {
    moves: res.actions.length,
    pushes,
    crates: state.crates.length,
    nodes: res.iterations,
    won: res.won,
    verified,
    ms
  };
}

// Difficulty blends solution length with crate count — a 10-move level with
// four crates asks more of you than a 10-move level with one.
function score(a) { return a.moves + 4 * (a.crates - 1); }
function tier(s) {
  if (s <= 10) return 1;   // Warm-up
  if (s <= 18) return 2;   // Easy
  if (s <= 27) return 3;   // Medium
  return 4;                // Tricky
}

const out = {};
const problems = [];
let totalMs = 0;

for (const set of ['main_levels', 'gen_levels']) {
  out[set] = raw[set].map((lines, i) => {
    const a = analyze(lines);
    totalMs += a.ms;
    if (!a.won || !a.verified) problems.push(`${set} #${i} won=${a.won} verified=${a.verified}`);
    return {
      id: i,
      map: lines,
      crates: a.crates,
      moves: a.moves,
      pushes: a.pushes,
      nodes: a.nodes,
      tier: tier(score(a))
    };
  });
  console.log(`${set}: ${out[set].length} levels`);
}

console.log(`total solve time: ${totalMs} ms`);
if (problems.length) {
  console.log('PROBLEM LEVELS:');
  problems.forEach(p => console.log('  ' + p));
} else {
  console.log('ALL LEVELS SOLVED AND VERIFIED BY REPLAY');
}

// distribution
for (const set of ['main_levels', 'gen_levels']) {
  const c = [0, 0, 0, 0, 0];
  out[set].forEach(l => c[l.tier]++);
  console.log(`${set} tiers  warmup=${c[1]} easy=${c[2]} medium=${c[3]} hard=${c[4]}`);
  const ms = out[set].map(l => l.moves);
  console.log(`  moves min=${Math.min(...ms)} max=${Math.max(...ms)}`);
}

const body =
`/* ============================================================================
 * levels.js — level data for the CMSC 221 Sokoban trainer
 *
 * Generated from the NYU CS-GY6613 Sokoban environment level files
 * (assets/main_levels/ and assets/gen_levels/). Do not edit by hand;
 * regenerate with tools/build-levels.js.
 *
 * Each level records the A* agent's own solution so the page can show a
 * par move count and sort levels by difficulty:
 *   map     rows of the level, in standard Sokoban notation
 *   crates  number of crates / goals
 *   moves   length of the A* solution (par)
 *   pushes  how many of those moves push a crate
 *   nodes   nodes the A* agent expanded to find it
 *   tier    1 warm-up, 2 easy, 3 medium, 4 hard (bucketed by moves)
 * ==========================================================================*/
var LEVELS = ${JSON.stringify(out)};

if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
`;

fs.writeFileSync(path.join(__dirname, '..', 'levels.js'), body);
console.log('wrote levels.js (' + body.length + ' bytes)');
