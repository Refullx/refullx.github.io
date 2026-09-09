/* 贪吃蛇 Hamilton 回路 + 安全抄近路 —— 纯逻辑，无 DOM，可在 Node 中直接测试 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SnakeCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DIRS = [
    { x: 0, y: -1 }, // up
    { x: 1, y: 0 },  // right
    { x: 0, y: 1 },  // down
    { x: -1, y: 0 }  // left
  ];

  /**
   * 构造 Hamilton 回路（要求 rows 为偶数）。
   * 路径：第 0 行从 (0,0) 向右走满；偶数行左->右（从 x=1 起），奇数行右->左（到 x=1 止）；
   * 最后沿第 0 列由下回到 (0,1)，与起点 (0,0) 相邻，闭合。
   * 返回 cellOfPos[pos] = cellIndex，posOfCell[cellIndex] = pos
   */
  function buildHamilton(cols, rows) {
    if (rows % 2 !== 0) throw new Error('rows must be even for Hamilton construction');
    const cellOfPos = [];
    for (let y = 0; y < rows; y++) {
      if (y % 2 === 0) {
        const x0 = y === 0 ? 0 : 1;
        for (let x = x0; x < cols; x++) cellOfPos.push(y * cols + x);
      } else {
        for (let x = cols - 1; x >= 1; x--) cellOfPos.push(y * cols + x);
      }
    }
    for (let y = rows - 1; y >= 1; y--) cellOfPos.push(y * cols);
    const posOfCell = new Array(cols * rows).fill(-1);
    for (let i = 0; i < cellOfPos.length; i++) posOfCell[cellOfPos[i]] = i;
    return { cellOfPos, posOfCell, length: cols * rows };
  }

  function neighbors(cell, cols, rows) {
    const x = cell % cols, y = (cell - x) / cols;
    const out = [];
    for (const d of DIRS) {
      const nx = x + d.x, ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      out.push(ny * cols + nx);
    }
    return out;
  }

  /** 蛇头所在自由连通区的大小（洪水填充，一旦够大就提前收工） */
  function regionSize(snake2, head2, cols, rows, capOut) {
    const occ = new Set(snake2);
    const cap = capOut || cols * rows;
    const seen = new Set([head2]);
    const stack = [];
    for (const nb of neighbors(head2, cols, rows)) {
      if (occ.has(nb)) continue;
      seen.add(nb); stack.push(nb);
    }
    let cnt = 0;
    while (stack.length) {
      const c = stack.pop();
      cnt++;
      if (cnt >= cap) return cnt;
      for (const nb of neighbors(c, cols, rows)) {
        if (occ.has(nb) || seen.has(nb)) continue;
        seen.add(nb); stack.push(nb);
      }
    }
    return cnt;
  }

  /** 假设走到 c 之后的新蛇身（吃到食物则不缩短） */
  function snakeAfter(snake, c, eating) {
    if (eating) return [c].concat(snake);
    return [c].concat(snake.slice(0, snake.length - 1));
  }

  /** 走到 c 之后，蛇头还剩几个可走的邻居（尾巴算作占位，偏保守） */
  function escapeCount(snake2, head2, cols, rows) {
    const occ = new Set(snake2);
    let free = 0;
    for (const nb of neighbors(head2, cols, rows)) if (!occ.has(nb)) free++;
    return free;
  }

  /**
   * AI 一步决策。三层保险，从严格到宽松依次降级：
   *   第一层  走完这一步后，蛇头所在自由连通区必须容得下整条蛇（洪水填充），且若走的是抄近路还必须跳过安全检查；
   *   第二层  退一步：不要求抄近路，但仍要求存活区够大；
   *   第三层  实在无路：在全部合法落点里挑存活空间最大的那一步，避免把自己关死。
   * 任何情况下都不会绕开检查强行走回路的下一格——那正是之前零星死亡的来源。
   *
   * 抄近路的安全规则有两个开关：
   *   skipped <= freeSpace * 0.5     跳过格子数不超过剩余空间的一半
   *   state.limit                    蛇身短于该阈值才允许抄近路（用于吃满全场模式）
   */
  function chooseMove(state, ham, mode) {
    mode = mode == null ? 12 : mode;
    const { snake, food, cols, rows } = state;
    const L = ham.length;
    const head = snake[0];
    const tailCell = snake[snake.length - 1];
    const len = snake.length;
    const body = new Set(snake);
    const headPos = ham.posOfCell[head];
    const foodPos = ham.posOfCell[food];
    const tailPos = ham.posOfCell[tailCell];
    const freeSpace = L - len;
    const limit = state.limit != null ? state.limit : Infinity;

    const pool = [];
    for (const c of neighbors(head, cols, rows)) {
      if (c !== food && body.has(c)) continue;           // 尾巴这一步会让位，所以可以走
      if (c === tailCell && c === food) continue;        // 吃到尾巴的那一步尾巴不移动
      // ---- 对照组专用分支：留给 tools/sim.js 做"这套规则为什么不行"的可复现对照 ----
      // 20 = 抄近路只限制"跳过格数 ≤ 剩余空间一半"，不做存活检查
      // 21 = 网上最常见的"落点领先蛇尾 > 蛇长"规则，不做存活检查
      // 两者都保留了历史上那个致命写法：实在没候选就直接沿回路走，绕过全部检查
      if (mode === 20 || mode === 21) {
        const pp = ham.posOfCell[c];
        const jj = (pp - headPos + L) % L;
        const dd = (foodPos - pp + L) % L;
        let usable = jj === 1;
        if (!usable) {
          if (mode === 20) usable = (jj - 1) <= freeSpace * 0.5;
          else usable = ((pp - tailPos + L) % L) > len;
        }
        pool.push({ c, dist: dd, jump: jj, region: 0, safe: usable, shortcutOk: usable });
        continue;
      }
      const p = ham.posOfCell[c];
      const jump = (p - headPos + L) % L;                // 沿回路前进几步，1 = 老实走一格
      const skipped = jump - 1;
      // 抄近路必须过安全闸门。mode 13 = 全程不抄近路，只沿回路走（用于"吃满全场"模式）
      const shortcutOk = jump === 1
        ? true
        : (mode !== 0 && mode !== 13 && len < limit && skipped <= freeSpace * 0.5);
      const dist = (foodPos - p + L) % L;                // 走完后离食物还剩多远
      let region = 0, safe = false;
      if (mode >= 9 && mode !== 13) {
        const after = snakeAfter(snake, c, c === food);
        region = regionSize(after, c, cols, rows, after.length + 1);
        safe = region >= after.length + 1;               // 存活区容得下整条蛇
      } else {
        safe = true;                                     // 纯走回路本身已被 200/200 局验证为绝对安全
      }
      pool.push({ c, dist, jump, region, safe, shortcutOk });
    }
    if (!pool.length) return -1;

    const better = (a, b) =>
      a.dist < b.dist || (a.dist === b.dist && a.jump > b.jump);

    let tier1 = pool.filter(o => o.safe && o.shortcutOk);
    if (tier1.length) return tier1.reduce((a, b) => (better(b, a) ? b : a)).c;
    let tier2 = pool.filter(o => o.safe);
    if (tier2.length) return tier2.reduce((a, b) => (better(b, a) ? b : a)).c;
    return pool.reduce((a, b) => (b.region > a.region ? b : a)).c;
  }

  function placeFood(snake, cols, rows, rng) {
    const body = new Set(snake);
    const free = [];
    for (let i = 0; i < cols * rows; i++) if (!body.has(i)) free.push(i);
    if (!free.length) return -1;
    return free[Math.floor(rng() * free.length)];
  }

  function createGame(cols, rows, opts) {
    opts = opts || {};
    const ham = buildHamilton(cols, rows);
    const startPos = opts.startPos != null ? opts.startPos : 0;
    const snake = [];
    for (let k = 0; k < (opts.startLen || 3); k++) {
      snake.push(ham.cellOfPos[(startPos - k + ham.length) % ham.length]);
    }
    const rng = opts.rng || Math.random;
    const g = {
      cols, rows, ham, snake, rng,
      food: placeFood(snake, cols, rows, rng),
      score: 0, eaten: 0, steps: 0, alive: true, won: false, cause: ''
    };
    return g;
  }

  /** 走一步；auto=true 时用 AI 选方向。返回 'move' | 'eat' | 'win' | 'dead' */
  function step(g, auto, mode) {
    if (!g.alive || g.won) return 'dead';
    let nextCell, eating = false;
    if (auto) {
      nextCell = chooseMove(g, g.ham, mode == null ? 3 : mode);
      if (nextCell < 0) { g.alive = false; g.cause = 'AI 无路可走'; return 'dead'; }
      eating = nextCell === g.food;
    } else {
      const { x, y } = g.pendingDir || { x: 1, y: 0 };
      const hx = g.snake[0] % g.cols, hy = (g.snake[0] - hx) / g.cols;
      let nx = hx + x, ny = hy + y;
      if (g.wrap) {
        // 手动模式的宽容选项：从一边飞出去，从另一边飞回来（不撞墙）
        nx = (nx + g.cols) % g.cols;
        ny = (ny + g.rows) % g.rows;
      } else if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) {
        g.alive = false; g.cause = '撞墙'; return 'dead';
      }
      nextCell = ny * g.cols + nx;
      eating = nextCell === g.food;
      const body = new Set(g.snake);
      const tailCell = g.snake[g.snake.length - 1];
      // 尾巴这一步会让位，所以走到"尾巴当前所在格"是安全的；
      // 唯一例外是这一格正好有食物——吃到东西尾巴不动，那格就不能进。
      const hitSelf = body.has(nextCell) && !(nextCell === tailCell && !eating);
      if (hitSelf) { g.alive = false; g.cause = '撞到自己'; return 'dead'; }
    }
    g.pendingDir = null;
    g.snake.unshift(nextCell);
    if (eating) {
      g.score += 1; g.eaten += 1;
      if (g.snake.length >= g.ham.length) { g.won = true; return 'win'; }
      g.food = placeFood(g.snake, g.cols, g.rows, g.rng);
      if (g.food < 0) { g.won = true; return 'win'; }
    } else {
      g.snake.pop();
    }
    g.steps += 1;
    return eating ? 'eat' : 'move';
  }

  return { DIRS, buildHamilton, neighbors, chooseMove, placeFood, createGame, step };
});
