/* ============================================================================
 * sokoban.js — Sokoban engine + A* solver
 *
 * A direct JavaScript port of the NYU CS-GY6613 Sokoban environment
 * (sokoban.py / helper.py / agent_master.py). Behaviour is intentionally
 * faithful to the Python original so that what students see here matches
 * what their Python/Java agents do.
 *
 * Map characters
 *   #  wall          @  player          +  player on goal
 *   $  crate         *  crate on goal   .  goal        (space) floor
 * ==========================================================================*/
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- State */

  function State() {
    this.solid = [];
    this.targets = [];
    this.crates = [];
    this.player = null;
    this.width = 0;
    this.height = 0;
    this.deadlocks = null;
  }

  // Build a level from an array of map rows (port of stringInitialize)
  State.prototype.stringInitialize = function (lines) {
    this.solid = [];
    this.targets = [];
    this.crates = [];
    this.player = null;

    lines = lines.map(function (l) { return l.replace(/\n|\r/g, ''); });
    while (lines.length && lines[0].trim().length === 0) lines.shift();
    while (lines.length && lines[lines.length - 1].trim().length === 0) lines.pop();

    this.height = lines.length;
    this.width = 0;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].length > this.width) this.width = lines[i].length;
    }

    for (var y = 0; y < this.height; y++) {
      var l = lines[y];
      this.solid.push([]);
      for (var x = 0; x < this.width; x++) {
        if (x > l.length - 1) { this.solid[y].push(false); continue; }
        var c = l[x];
        if (c === '#') {
          this.solid[y].push(true);
        } else {
          this.solid[y].push(false);
          if (c === '@' || c === '+') this.player = { x: x, y: y };
          if (c === '$' || c === '*') this.crates.push({ x: x, y: y });
          if (c === '.' || c === '+' || c === '*') this.targets.push({ x: x, y: y });
        }
      }
    }
    return this;
  };

  State.prototype.clone = function () {
    var c = new State();
    c.width = this.width;
    c.height = this.height;
    c.solid = this.solid;           // walls never change — share by reference
    c.deadlocks = this.deadlocks;
    c.player = { x: this.player.x, y: this.player.y };
    for (var i = 0; i < this.targets.length; i++) {
      c.targets.push({ x: this.targets[i].x, y: this.targets[i].y });
    }
    for (var j = 0; j < this.crates.length; j++) {
      c.crates.push({ x: this.crates[j].x, y: this.crates[j].y });
    }
    return c;
  };

  State.prototype.checkWin = function () {
    if (this.targets.length !== this.crates.length ||
        this.targets.length === 0 || this.crates.length === 0) return false;
    for (var i = 0; i < this.targets.length; i++) {
      if (this._checkCrateLocation(this.targets[i].x, this.targets[i].y) === null) return false;
    }
    return true;
  };

  // Move the player. Returns true only when a crate was pushed.
  State.prototype.update = function (dirX, dirY) {
    if (Math.abs(dirX) > 0 && Math.abs(dirY) > 0) return false;
    if (this.checkWin()) return false;
    dirX = dirX > 0 ? 1 : (dirX < 0 ? -1 : 0);
    dirY = dirY > 0 ? 1 : (dirY < 0 ? -1 : 0);

    var newX = this.player.x + dirX;
    var newY = this.player.y + dirY;

    if (this._checkMovableLocation(newX, newY)) {
      this.player.x = newX;
      this.player.y = newY;
    } else {
      var crate = this._checkCrateLocation(newX, newY);
      if (crate !== null) {
        var cx = crate.x + dirX, cy = crate.y + dirY;
        if (this._checkMovableLocation(cx, cy)) {
          this.player.x = newX;
          this.player.y = newY;
          crate.x = cx;
          crate.y = cy;
          return true;             // a push happened
        }
      }
    }
    return false;
  };

  State.prototype.render = function () {
    var result = '';
    for (var y = 0; y < this.height; y++) {
      for (var x = 0; x < this.width; x++) {
        if (this.solid[y][x]) { result += '#'; continue; }
        var crate = this._checkCrateLocation(x, y) !== null;
        var target = this._checkTargetLocation(x, y) !== null;
        var player = this.player.x === x && this.player.y === y;
        if (crate) result += target ? '*' : '$';
        else if (player) result += target ? '+' : '@';
        else result += target ? '.' : ' ';
      }
      result += '\n';
    }
    return result.slice(0, -1);
  };

  State.prototype._checkOutside = function (x, y) {
    return x < 0 || y < 0 || x > this.solid[0].length - 1 || y > this.solid.length - 1;
  };
  State.prototype._checkTargetLocation = function (x, y) {
    for (var i = 0; i < this.targets.length; i++) {
      if (this.targets[i].x === x && this.targets[i].y === y) return this.targets[i];
    }
    return null;
  };
  State.prototype._checkCrateLocation = function (x, y) {
    for (var i = 0; i < this.crates.length; i++) {
      if (this.crates[i].x === x && this.crates[i].y === y) return this.crates[i];
    }
    return null;
  };
  State.prototype._checkMovableLocation = function (x, y) {
    return !this._checkOutside(x, y) && !this.solid[y][x] && this._checkCrateLocation(x, y) === null;
  };

  /* --------------------------------------------------------------- Helper */

  var directions = [
    { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }
  ];

  function getHash(state) {
    var key = state.player.x + ',' + state.player.y + ',' +
              state.crates.length + ',' + state.targets.length;
    for (var i = 0; i < state.crates.length; i++) key += ',' + state.crates[i].x + ',' + state.crates[i].y;
    for (var j = 0; j < state.targets.length; j++) key += ',' + state.targets[j].x + ',' + state.targets[j].y;
    return key;
  }

  // Greedy nearest-target Manhattan matching — the NYU heuristic.
  function getHeuristic(state) {
    var targets = state.targets.slice();
    var distance = 0;
    for (var i = 0; i < state.crates.length; i++) {
      var c = state.crates[i];
      var bestDist = state.width + state.height;
      var bestMatch = 0;
      for (var t = 0; t < targets.length; t++) {
        var d = Math.abs(c.x - targets[t].x) + Math.abs(c.y - targets[t].y);
        if (bestDist > d) { bestMatch = t; bestDist = d; }
      }
      if (targets.length === 0) continue;
      distance += Math.abs(targets[bestMatch].x - c.x) + Math.abs(targets[bestMatch].y - c.y);
      targets.splice(bestMatch, 1);
    }
    return distance;
  }

  // Squares a crate can never come back from: corners, and wall-runs between
  // two corners with no goal on them.
  function initializeDeadlocks(state) {
    var sign = function (x) { return x === 0 ? 0 : (x > 0 ? 1 : -1); };
    state.deadlocks = [];
    for (var y = 0; y < state.height; y++) {
      state.deadlocks.push([]);
      for (var x = 0; x < state.width; x++) state.deadlocks[y].push(false);
    }

    var corners = [];
    for (y = 0; y < state.height; y++) {
      for (x = 0; x < state.width; x++) {
        if (x === 0 || y === 0 || x === state.width - 1 || y === state.height - 1 || state.solid[y][x]) continue;
        if ((state.solid[y - 1][x] && state.solid[y][x - 1]) ||
            (state.solid[y - 1][x] && state.solid[y][x + 1]) ||
            (state.solid[y + 1][x] && state.solid[y][x - 1]) ||
            (state.solid[y + 1][x] && state.solid[y][x + 1])) {
          if (!state._checkTargetLocation(x, y)) {
            corners.push({ x: x, y: y });
            state.deadlocks[y][x] = true;
          }
        }
      }
    }

    for (var a = 0; a < corners.length; a++) {
      for (var b = 0; b < corners.length; b++) {
        var c1 = corners[a], c2 = corners[b];
        var dx = sign(c1.x - c2.x), dy = sign(c1.y - c2.y);
        if ((dx === 0 && dy === 0) || (dx !== 0 && dy !== 0)) continue;
        var walls = [];
        var wx = c2.x, wy = c2.y;
        if (dx !== 0) {
          wx += dx;
          while (wx !== c1.x) {
            if (state._checkTargetLocation(wx, wy) || state.solid[wy][wx] ||
                (!state.solid[wy - 1][wx] && !state.solid[wy + 1][wx])) { walls = []; break; }
            walls.push({ x: wx, y: wy });
            wx += dx;
          }
        }
        if (dy !== 0) {
          wy += dy;
          while (wy !== c1.y) {
            if (state._checkTargetLocation(wx, wy) || state.solid[wy][wx] ||
                (!state.solid[wy][wx - 1] && !state.solid[wy][wx + 1])) { walls = []; break; }
            walls.push({ x: wx, y: wy });
            wy += dy;
          }
        }
        for (var w = 0; w < walls.length; w++) state.deadlocks[walls[w].y][walls[w].x] = true;
      }
    }
  }

  function checkDeadlock(state) {
    if (!state.deadlocks) return false;
    for (var i = 0; i < state.crates.length; i++) {
      if (state.deadlocks[state.crates[i].y][state.crates[i].x]) return true;
    }
    return false;
  }

  /* ----------------------------------------------------------------- Node */

  var BALANCE = 0.5;   // weighted A*: f = h + BALANCE * g

  function Node(state, parent, action) {
    this.state = state;
    this.parent = parent;
    this.action = action;
    this.depth = parent ? parent.depth + 1 : 0;
  }
  Node.prototype.getChildren = function () {
    var children = [];
    for (var i = 0; i < directions.length; i++) {
      var d = directions[i];
      var child = this.state.clone();
      var crateMove = child.update(d.x, d.y);
      if (child.player.x === this.state.player.x && child.player.y === this.state.player.y) continue;
      if (crateMove && checkDeadlock(child)) continue;   // prune hopeless pushes
      children.push(new Node(child, this, d));
    }
    return children;
  };
  Node.prototype.getHash = function () { return getHash(this.state); };
  Node.prototype.getCost = function () { return this.depth; };
  Node.prototype.getHeuristic = function () { return getHeuristic(this.state); };
  Node.prototype.checkWin = function () { return this.state.checkWin(); };
  Node.prototype.getActions = function () {
    var actions = [], cur = this;
    while (cur.parent !== null) { actions.unshift(cur.action); cur = cur.parent; }
    return actions;
  };

  /* -------------------------------------------------------- Priority queue
   * Binary min-heap ordered by f = h + BALANCE * g, matching the Python
   * PriorityQueue + Node.__lt__ pairing.
   * ---------------------------------------------------------------------*/

  function PQueue() { this.items = []; }
  PQueue.prototype.size = function () { return this.items.length; };
  PQueue.prototype._f = function (n) {
    if (n._f === undefined) n._f = n.getHeuristic() + BALANCE * n.getCost();
    return n._f;
  };
  PQueue.prototype.push = function (node) {
    var items = this.items;
    items.push(node);
    var i = items.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (this._f(items[i]) < this._f(items[p])) {
        var t = items[i]; items[i] = items[p]; items[p] = t;
        i = p;
      } else break;
    }
  };
  PQueue.prototype.pop = function () {
    var items = this.items;
    var top = items[0];
    var last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, s = i;
        if (l < items.length && this._f(items[l]) < this._f(items[s])) s = l;
        if (r < items.length && this._f(items[r]) < this._f(items[s])) s = r;
        if (s === i) break;
        var t = items[i]; items[i] = items[s]; items[s] = t;
        i = s;
      }
    }
    return top;
  };

  /* ------------------------------------------------------------ A* solver */

  /**
   * Solve a level with weighted A*.
   * Returns { actions, won, iterations, heuristic }.
   * If no win is found within maxIterations, the action list of the best node
   * seen so far is returned (the NYU `bestNode` fallback).
   */
  function solveAStar(state, maxIterations) {
    if (maxIterations === undefined) maxIterations = 100000;
    var start = state.clone();
    initializeDeadlocks(start);

    var iterations = 0;
    var bestNode = null;
    var queue = new PQueue();
    queue.push(new Node(start, null, null));
    var visited = Object.create(null);

    while ((iterations < maxIterations || maxIterations <= 0) && queue.size() > 0) {
      iterations++;
      var current = queue.pop();
      if (current.checkWin()) {
        return {
          actions: current.getActions(),
          won: true,
          iterations: iterations,
          heuristic: 0
        };
      }
      var hash = current.getHash();
      if (visited[hash] === undefined) {
        if (bestNode === null || current.getHeuristic() < bestNode.getHeuristic()) {
          bestNode = current;
        } else if (current.getHeuristic() === bestNode.getHeuristic() &&
                   current.getCost() < bestNode.getCost()) {
          bestNode = current;
        }
        visited[hash] = true;
        var children = current.getChildren();
        for (var i = 0; i < children.length; i++) queue.push(children[i]);
      }
    }
    return {
      actions: bestNode ? bestNode.getActions() : [],
      won: false,
      iterations: iterations,
      heuristic: bestNode ? bestNode.getHeuristic() : -1
    };
  }

  /* ---------------------------------------------------------------- Export */

  var api = {
    State: State,
    Node: Node,
    directions: directions,
    getHash: getHash,
    getHeuristic: getHeuristic,
    initializeDeadlocks: initializeDeadlocks,
    checkDeadlock: checkDeadlock,
    solveAStar: solveAStar,
    BALANCE: BALANCE,
    fromLines: function (lines) { return new State().stringInitialize(lines.slice()); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Sokoban = api;

})(typeof window !== 'undefined' ? window : globalThis);
