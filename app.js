/* ============================================================================
 * app.js — UI for the Sokoban trainer
 * Rendering, input, level picker, progress, and the A* hint/solve buttons.
 * ==========================================================================*/
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var SET_LABEL = { main_levels: 'Level', gen_levels: 'Generated level' };
  var STORE_KEY = 'cmsc221-sokoban-progress-v1';
  var THEME_KEY = 'cmsc221-sokoban-theme';

  /* ------------------------------------------------------- persisted state
   * localStorage is a convenience only: if it is unavailable (private window,
   * blocked site data) the page still works, it just forgets.
   * ---------------------------------------------------------------------*/

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) {}
  }
  var progress = loadProgress();
  function key(set, id) { return set + ':' + id; }

  /* -------------------------------------------------------------- app state */

  var setName = 'main_levels';
  var levelIndex = 0;
  var filterTier = 0;

  var state = null;        // live Sokoban.State
  var history = [];        // undo stack of {x,y} moves applied
  var moves = 0, pushes = 0;
  var facing = { x: 0, y: 1 };
  var solving = false;
  var solveTimer = null;
  var tileSize = 44;

  var board = $('board');

  /* ---------------------------------------------------------------- theme */

  (function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    }
    syncThemeLabel();
  })();

  function currentTheme() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }
  function syncThemeLabel() {
    $('themeBtn').textContent = currentTheme() === 'dark' ? 'Light mode' : 'Dark mode';
  }
  $('themeBtn').addEventListener('click', function () {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    syncThemeLabel();
  });

  /* ------------------------------------------------------------- rendering */

  function levelData() { return LEVELS[setName][levelIndex]; }

  function computeTileSize(w, h) {
    var frameW = board.parentElement.clientWidth - 28;
    var maxW = Math.max(180, frameW);
    var maxH = Math.min(520, Math.max(240, window.innerHeight - 340));
    return Math.max(18, Math.min(58, Math.floor(Math.min(maxW / w, maxH / h))));
  }

  // The static layer (floor, walls, goals) is rebuilt only on level change;
  // crates and the player are persistent nodes moved with transforms so the
  // A* playback animates smoothly.
  var actors = { player: null, crates: [] };

  function buildBoard() {
    board.innerHTML = '';
    actors = { player: null, crates: [] };

    tileSize = computeTileSize(state.width, state.height);
    board.style.width = state.width * tileSize + 'px';
    board.style.height = state.height * tileSize + 'px';

    var frag = document.createDocumentFragment();

    for (var y = 0; y < state.height; y++) {
      for (var x = 0; x < state.width; x++) {
        var d = document.createElement('div');
        d.className = 'tile ' + (state.solid[y][x]
          ? 'wall'
          : 'floor' + ((x + y) % 2 ? ' alt' : ''));
        if (!state.solid[y][x] && state._checkTargetLocation(x, y)) d.className += ' goal';
        d.style.cssText = 'left:' + (x * tileSize) + 'px;top:' + (y * tileSize) +
                          'px;width:' + tileSize + 'px;height:' + tileSize + 'px';
        frag.appendChild(d);
      }
    }

    for (var c = 0; c < state.crates.length; c++) {
      var cr = document.createElement('div');
      cr.className = 'actor crate nomove';
      cr.style.width = cr.style.height = Math.round(tileSize * 0.82) + 'px';
      frag.appendChild(cr);
      actors.crates.push(cr);
    }

    var p = document.createElement('div');
    p.className = 'actor player nomove';
    p.style.width = p.style.height = Math.round(tileSize * 0.78) + 'px';
    p.innerHTML = '<span class="eye l"></span><span class="eye r"></span>';
    frag.appendChild(p);
    actors.player = p;

    var arrow = document.createElement('div');
    arrow.className = 'hint-arrow';
    arrow.id = 'hintArrow';
    arrow.hidden = true;
    arrow.style.width = arrow.style.height = tileSize + 'px';
    arrow.style.fontSize = Math.round(tileSize * 0.62) + 'px';
    frag.appendChild(arrow);

    board.appendChild(frag);
    paint();

    // drop the no-transition guard once the first frame has landed
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (var i = 0; i < actors.crates.length; i++) actors.crates[i].classList.remove('nomove');
        actors.player.classList.remove('nomove');
      });
    });
  }

  function place(el, x, y, size) {
    var off = (tileSize - size) / 2;
    el.style.transform = 'translate(' + (x * tileSize + off) + 'px,' + (y * tileSize + off) + 'px)';
  }

  function paint() {
    var crateSize = Math.round(tileSize * 0.82);
    for (var i = 0; i < state.crates.length; i++) {
      var c = state.crates[i];
      place(actors.crates[i], c.x, c.y, crateSize);
      actors.crates[i].classList.toggle('done', state._checkTargetLocation(c.x, c.y) !== null);
    }
    var pSize = Math.round(tileSize * 0.78);
    place(actors.player, state.player.x, state.player.y, pSize);

    // eyes look the way you last moved
    var eyes = actors.player.querySelectorAll('.eye');
    var ox = facing.x * tileSize * 0.07, oy = facing.y * tileSize * 0.07;
    for (var e = 0; e < eyes.length; e++) {
      eyes[e].style.transform = 'translate(' + ox + 'px,' + oy + 'px)';
    }

    $('statMoves').textContent = moves;
    $('statPushes').textContent = pushes;
  }

  /* ------------------------------------------------------------ level load */

  function loadLevel(set, idx, opts) {
    opts = opts || {};
    stopSolving();
    setName = set;
    levelIndex = Math.max(0, Math.min(LEVELS[set].length - 1, idx));

    var data = levelData();
    state = Sokoban.fromLines(data.map);
    history = [];
    moves = 0;
    pushes = 0;
    facing = { x: 0, y: 1 };

    $('levelTitle').textContent = SET_LABEL[set] + ' ' + data.id;
    $('statPar').textContent = data.moves;
    var best = progress[key(set, data.id)];
    $('statBest').textContent = best ? best.best : '–';
    $('solveNote').textContent = '';
    $('solveNote').classList.remove('bad');
    $('winOverlay').hidden = true;

    buildBoard();
    renderLevelGrid();
    updateButtons();
    if (!opts.keepFocus) board.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ play */

  function move(dx, dy) {
    if (solving || state.checkWin()) return;
    hideHint();

    var before = { x: state.player.x, y: state.player.y };
    facing = { x: dx, y: dy };
    var pushed = state.update(dx, dy);

    if (state.player.x === before.x && state.player.y === before.y) {
      paint();          // blocked — still update where the eyes look
      return;
    }

    history.push({ x: dx, y: dy });
    moves++;
    if (pushed) pushes++;
    paint();

    if (state.checkWin()) onWin();
    updateButtons();
  }

  function undo() {
    if (solving || history.length === 0) return;
    hideHint();
    var replay = history.slice(0, -1);
    state = Sokoban.fromLines(levelData().map);
    moves = 0; pushes = 0;
    for (var i = 0; i < replay.length; i++) {
      if (state.update(replay[i].x, replay[i].y)) pushes++;
      moves++;
      facing = replay[i];
    }
    history = replay;
    $('winOverlay').hidden = true;
    paint();
    updateButtons();
  }

  function reset() {
    stopSolving();
    var data = levelData();
    state = Sokoban.fromLines(data.map);
    history = []; moves = 0; pushes = 0;
    facing = { x: 0, y: 1 };
    hideHint();
    $('winOverlay').hidden = true;
    $('solveNote').textContent = '';
    $('solveNote').classList.remove('bad');
    paint();
    updateButtons();
  }

  function onWin() {
    var data = levelData();
    var k = key(setName, data.id);

    // Watching the agent solve it does not count as solving it yourself.
    if (!solving) {
      var prev = progress[k];
      if (!prev || moves < prev.best) progress[k] = { best: moves };
      saveProgress();
      $('statBest').textContent = progress[k].best;
    }

    $('winTitle').textContent = solving ? 'A* solved it' : 'Solved';

    var sub;
    if (solving) {
      sub = 'The agent used ' + moves + ' moves. Reset and try it yourself to log the level.';
    } else if (moves < data.moves) {
      sub = moves + ' moves — ' + (data.moves - moves) + ' better than A*. Nice.';
    } else if (moves === data.moves) {
      sub = moves + ' moves — exactly par.';
    } else {
      sub = moves + ' moves. A* found it in ' + data.moves + '.';
    }
    $('winSub').textContent = sub;
    $('winOverlay').hidden = false;
    renderLevelGrid();
    updateProgressText();
  }

  /* ------------------------------------------------------------ A* buttons */

  function hideHint() {
    var a = $('hintArrow');
    if (a) a.hidden = true;
  }

  var ARROW = {
    '-1,0': '←', '1,0': '→', '0,-1': '↑', '0,1': '↓'
  };

  function hint() {
    if (solving) return;
    var note = $('solveNote');
    note.classList.remove('bad');

    if (state.checkWin()) { note.textContent = 'Already solved.'; return; }

    var res = Sokoban.solveAStar(state.clone(), 200000);
    if (!res.won || res.actions.length === 0) {
      note.textContent = 'No solution from here — a crate is stuck. Undo or reset.';
      note.classList.add('bad');
      hideHint();
      return;
    }

    var a = res.actions[0];
    var arrow = $('hintArrow');
    arrow.textContent = ARROW[a.x + ',' + a.y];
    arrow.style.transform = 'translate(' +
      ((state.player.x + a.x) * tileSize) + 'px,' +
      ((state.player.y + a.y) * tileSize) + 'px)';
    arrow.hidden = false;

    note.textContent = 'A* says go ' + ARROW[a.x + ',' + a.y] + ' — ' +
                       res.actions.length + ' move' + (res.actions.length === 1 ? '' : 's') +
                       ' left, found in ' + res.iterations.toLocaleString() + ' nodes.';
  }

  function stopSolving() {
    solving = false;
    if (solveTimer) { clearInterval(solveTimer); solveTimer = null; }
    updateButtons();
  }

  function solve() {
    if (solving) { stopSolving(); $('solveNote').textContent = 'Playback stopped.'; return; }

    var note = $('solveNote');
    note.classList.remove('bad');
    hideHint();

    var t0 = performance.now();
    var res = Sokoban.solveAStar(state.clone(), 200000);
    var ms = Math.round(performance.now() - t0);

    if (!res.won) {
      note.textContent = 'No solution from here — a crate is stuck. Undo or reset.';
      note.classList.add('bad');
      return;
    }

    note.textContent = 'A*: ' + res.actions.length + ' moves, ' +
                       res.iterations.toLocaleString() + ' nodes expanded, ' + ms + ' ms.';

    solving = true;
    updateButtons();
    var i = 0;
    solveTimer = setInterval(function () {
      if (i >= res.actions.length) {
        clearInterval(solveTimer);
        solveTimer = null;
        if (state.checkWin()) onWin();   // reads `solving` to title the overlay
        solving = false;
        updateButtons();
        return;
      }
      var a = res.actions[i++];
      facing = a;
      if (state.update(a.x, a.y)) pushes++;
      moves++;
      history.push(a);
      paint();
    }, 145);
  }

  /* ------------------------------------------------------------- level list */

  function renderLevelGrid() {
    var grid = $('levelGrid');
    var list = LEVELS[setName];
    grid.innerHTML = '';
    var frag = document.createDocumentFragment();

    for (var i = 0; i < list.length; i++) {
      var lv = list[i];
      if (filterTier !== 0 && lv.tier !== filterTier) continue;

      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lvl t' + lv.tier;
      b.textContent = lv.id;
      b.title = lv.crates + ' crate' + (lv.crates === 1 ? '' : 's') +
                ' · A* par ' + lv.moves + ' moves (' + lv.pushes + ' pushes)';
      if (progress[key(setName, lv.id)]) b.classList.add('solved');
      if (i === levelIndex) b.setAttribute('aria-current', 'true');
      b.dataset.idx = i;
      frag.appendChild(b);
    }
    grid.appendChild(frag);
    updateProgressText();
  }

  function updateProgressText() {
    var list = LEVELS[setName];
    var n = 0;
    for (var i = 0; i < list.length; i++) if (progress[key(setName, list[i].id)]) n++;
    $('progressText').textContent = n + ' of ' + list.length + ' solved';
  }

  function updateButtons() {
    $('btnUndo').disabled = solving || history.length === 0;
    $('btnPrev').disabled = solving || levelIndex === 0;
    $('btnNext').disabled = solving || levelIndex >= LEVELS[setName].length - 1;
    $('btnHint').disabled = solving;
    $('btnSolve').textContent = solving ? 'Stop' : 'Watch A* solve';
  }

  /* ------------------------------------------------------------------ wiring */

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    var k = e.key;
    var handled = true;
    switch (k) {
      case 'ArrowLeft':  case 'a': case 'A': move(-1, 0); break;
      case 'ArrowRight': case 'd': case 'D': move(1, 0);  break;
      case 'ArrowUp':    case 'w': case 'W': move(0, -1); break;
      case 'ArrowDown':  case 's': case 'S': move(0, 1);  break;
      case 'u': case 'U': case 'z': case 'Z': undo(); break;
      case 'r': case 'R': reset(); break;
      case 'n': case 'N': if (!$('btnNext').disabled) loadLevel(setName, levelIndex + 1); break;
      case 'p': case 'P': if (!$('btnPrev').disabled) loadLevel(setName, levelIndex - 1); break;
      case 'h': case 'H': hint(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });

  $('btnUndo').addEventListener('click', undo);
  $('btnReset').addEventListener('click', reset);
  $('btnHint').addEventListener('click', hint);
  $('btnSolve').addEventListener('click', solve);
  $('btnPrev').addEventListener('click', function () { loadLevel(setName, levelIndex - 1); });
  $('btnNext').addEventListener('click', function () { loadLevel(setName, levelIndex + 1); });
  $('winNext').addEventListener('click', function () {
    if (levelIndex < LEVELS[setName].length - 1) loadLevel(setName, levelIndex + 1);
    else $('winOverlay').hidden = true;
  });

  document.querySelector('.dpad').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) move(+b.dataset.dx, +b.dataset.dy);
  });

  document.querySelector('.tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var tabs = this.querySelectorAll('button');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute('aria-selected', String(tabs[i] === b));
    }
    loadLevel(b.dataset.set, 0);
  });

  $('filters').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var chips = this.querySelectorAll('button');
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute('aria-pressed', String(chips[i] === b));
    }
    filterTier = +b.dataset.tier;
    renderLevelGrid();
  });

  $('levelGrid').addEventListener('click', function (e) {
    var b = e.target.closest('.lvl');
    if (b) loadLevel(setName, +b.dataset.idx);
  });

  $('btnClear').addEventListener('click', function () {
    progress = {};
    saveProgress();
    renderLevelGrid();
    $('statBest').textContent = '–';
  });

  // swipe on touch devices
  (function () {
    var sx = 0, sy = 0, tracking = false;
    board.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    board.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
      else move(0, dy > 0 ? 1 : -1);
    }, { passive: true });
  })();

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (state) buildBoard(); }, 120);
  });

  /* ---------------------------------------------------------------- start */
  loadLevel('main_levels', 0, { keepFocus: true });
})();
