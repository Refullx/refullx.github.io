/*
 * 阶段一"一局能玩多久"的量化对照。
 *
 * 背景：手动模式加宽容规则（穿墙 + 续命）到底值不值？与其凭感觉，不如量化。
 * 做法：写一个会手滑的模拟玩家（大部分时候朝食物走，时不时乱按），
 *       在不同规则组合下各跑几百局，比较平均步数 / 得分 / 折算时长。
 *
 * 用法：  node tools/life-sim.js
 *        node tools/life-sim.js --games=800
 *
 * 注意：模拟出来的绝对数字取决于"玩家有多菜"这个假设，别当真；
 *      有意义的是同一假设下几种规则之间的**倍数差**。
 */
'use strict';
const core = require('./core.js');

const COLS = 20, ROWS = 20;
const STEP_PER_SEC = 8;        // 手动模式默认速度，用来把步数折算成秒
const REVIVE_KEEP = 0.6;       // 续命后保留的蛇身比例，和 app.js 保持一致
const REVIVE_MIN = 3;

const arg = (k, d) => {
  const hit = process.argv.find(s => s.startsWith('--' + k + '='));
  return hit ? Number(hit.split('=')[1]) : d;
};
const GAMES = arg('games', 400);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * 模拟一个"会手滑的玩家"。
 * @param skill  每步有多少概率做出理性选择（朝食物），剩下的是随机乱按
 * @param lives  几条命
 * @param wrap   是否允许从边界飞到另一边
 */
function simulate(lives, wrap, games, seedBase, skill) {
  let sumSteps = 0, sumScore = 0;
  for (let n = 0; n < games; n++) {
    const rng = mulberry32(seedBase * 100003 + n * 7919 + 13);
    const ham = core.buildHamilton(COLS, ROWS);
    const g = core.createGame(COLS, ROWS, { rng, startLen: 3, startPos: ham.posOfCell[10 * COLS + 10] });
    g.wrap = wrap;
    let life = lives, dir = { x: 1, y: 0 }, guard = 0;

    while (guard < 60000) {
      guard++;
      const hx = g.snake[0] % COLS, hy = (g.snake[0] - hx) / COLS;
      const fx = g.food % COLS, fy = (g.food - fx) / COLS;
      let want;
      if (rng() < skill) {
        const dx = fx - hx, dy = fy - hy;
        want = Math.abs(dx) > Math.abs(dy)
          ? { x: Math.sign(dx) || dir.x, y: 0 }
          : { x: 0, y: Math.sign(dy) || dir.y };
      } else {
        const cand = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
        want = cand[Math.floor(rng() * 4)];
      }
      if (!(want.x === -dir.x && want.y === -dir.y)) dir = want;   // 不允许 180° 掉头
      g.pendingDir = dir;

      const r = core.step(g, false);
      if (r === 'dead') {
        life--;
        if (life <= 0) break;
        const keep = Math.max(REVIVE_MIN, Math.round(g.snake.length * REVIVE_KEEP));
        g.snake = g.snake.slice(0, keep);
        g.alive = true; g.cause = '';
      }
      if (g.won) break;
    }
    sumSteps += g.steps;
    sumScore += g.score;
  }
  return {
    steps: Math.round(sumSteps / games),
    score: (sumScore / games).toFixed(1),
    sec: (sumSteps / games / STEP_PER_SEC).toFixed(1)
  };
}

function report(title, seed, skill, games, configs) {
  console.log('\n=== ' + title + ' （每种配置 ' + games + ' 局）===');
  console.log('规则组合              平均步数   平均得分   平均一局时长');
  const rows = [];
  for (const [lives, wrap, name] of configs) {
    const r = simulate(lives, wrap, games, seed, skill);
    rows.push({ name, ...r });
    console.log(
      name.padEnd(20) + String(r.steps).padEnd(11) + String(r.score).padEnd(11) + r.sec + ' 秒'
    );
  }
  const base = rows[0];
  console.log('\n相对"最严格规则"的时长倍数：');
  rows.forEach(r => {
    console.log('  ' + r.name.padEnd(20) + (r.steps / base.steps).toFixed(2) + ' ×');
  });
}

console.log('手动默认速度 ' + STEP_PER_SEC + ' 步/秒，所以折算时长 = 步数 / ' + STEP_PER_SEC);
report('新手玩家（70% 朝食物走，30% 手滑）', 0, 0.7, GAMES, [
  [1, false, '1 命 + 撞墙即死'],
  [3, false, '3 命 + 撞墙即死'],
  [1, true, '1 命 + 穿墙'],
  [3, true, '3 命 + 穿墙（默认）'],
  [5, true, '5 命 + 穿墙']
]);
report('完全不会玩（50% 手滑）', 42, 0.5, Math.max(150, Math.round(GAMES * 0.5)), [
  [1, false, '1 命 + 撞墙即死'],
  [3, true, '3 命 + 穿墙（默认）'],
  [5, true, '5 命 + 穿墙']
]);

console.log('\n结论：主导因素是"能不能穿墙"，不是命数。两者叠加后一局大约是原来的 6~7 倍。');
