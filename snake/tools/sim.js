/**
 * 贪吃蛇 AI 离线验证脚本
 *
 *   node tools/sim.js            # 默认：4 组随机种子 × 2000 局，目标吃满 15 个食物
 *   node tools/sim.js --full     # 额外跑「满盘挑战」模式（吃满 400 格），较慢
 *   node tools/sim.js --games=500
 *
 * 目的只有一个：用可复现的数据证明 AI 在达成"连续吃完 15 个食物"之前不会死。
 */
'use strict';
const core = require('./core.js');

const COLS = 20, ROWS = 20;
const arg = (k, d) => {
  const hit = process.argv.find(s => s.startsWith('--' + k + '='));
  return hit ? hit.split('=')[1] : d;
};
const GAMES = parseInt(arg('games', '2000'), 10);
const FULL = process.argv.includes('--full');
const SEEDS = [0, 555, 12345, 77777];

/** 可复现的伪随机数发生器（同种子必定得到同一批局面） */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeGame(seed) {
  const rng = mulberry32(seed);
  const ham = core.buildHamilton(COLS, ROWS);
  const startCell = Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2);   // 和页面一致：从棋盘中间出生
  return core.createGame(COLS, ROWS, { rng, startLen: 3, startPos: ham.posOfCell[startCell] });
}

/** 1. Hamilton 回路自检：是否恰好覆盖全部格子、相邻是否真挨着、首尾是否闭合 */
function checkHamilton(cols, rows) {
  const ham = core.buildHamilton(cols, rows);
  const total = cols * rows;
  const unique = new Set(ham.cellOfPos).size === total && ham.cellOfPos.length === total;
  let closed = true;
  for (let i = 0; i < ham.cellOfPos.length; i++) {
    const a = ham.cellOfPos[i], b = ham.cellOfPos[(i + 1) % ham.cellOfPos.length];
    const ax = a % cols, ay = (a - ax) / cols, bx = b % cols, by = (b - bx) / cols;
    if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) { closed = false; break; }
  }
  return { cols, rows, unique, closed };
}

/** 2. 批量对局：统计达到目标食物数之前的死亡情况 */
function trial(mode, games, seedBase, target, cap) {
  let deaths = 0, reached = 0, wins = 0, sumSteps = 0, maxSteps = 0;
  const causes = {};
  for (let n = 0; n < games; n++) {
    const g = makeGame(seedBase * 100003 + n * 7919 + 13);
    let guard = 0;
    while (g.alive && !g.won && g.eaten < target && guard < cap) { core.step(g, true, mode); guard++; }
    if (!g.alive) { deaths++; causes[g.cause] = (causes[g.cause] || 0) + 1; }
    else { reached++; sumSteps += g.steps; maxSteps = Math.max(maxSteps, g.steps); }
    if (g.won) wins++;
  }
  return { deaths, reached, wins, causes, avg: Math.round(sumSteps / Math.max(1, reached)), maxSteps };
}

console.log('=== 1. Hamilton 回路自检 ===');
for (const [c, r] of [[COLS, ROWS], [16, 20], [24, 18], [10, 10], [30, 20]]) {
  const t = checkHamilton(c, r);
  console.log(`  ${c}×${r}: 覆盖全部格子且不重复 = ${t.unique}   相邻且首尾闭合 = ${t.closed}`);
}

console.log(`\n=== 2. 主模式（12）：目标 = 连续吃完 15 个食物不死，每档 ${GAMES} 局 ===`);
let total = 0, dead = 0;
for (const s of SEEDS) {
  const t0 = Date.now();
  const r = trial(12, GAMES, s, 15, 200000);
  total += GAMES; dead += r.deaths;
  console.log(`  种子 ${String(s).padEnd(6)} 死亡 ${String(r.deaths).padEnd(3)} 平均 ${String(r.avg).padEnd(4)} 步  最差 ${r.maxSteps} 步  ${JSON.stringify(r.causes)}  (${Date.now() - t0}ms)`);
}
console.log(`  合计：死亡 ${dead} / ${total}${dead === 0 ? '  ✅ 达标' : '  ❌ 未达标'}`);

console.log('\n=== 3. 对照组：不做洪水填充存活检查时会怎样（同一目标，同一批种子）===');
console.log('  规则                                            死亡/局数     平均步数');
const rules = [
  [21, '抄近路条件是「落点领先蛇尾 > 蛇长」（网上最常见说法）', 1000],
  [20, '抄近路条件是「跳过格数 ≤ 剩余空间一半」', 2000],
  [13, '纯走回路，完全不抄近路', 300],
  [12, '最终方案：三层降级 + 洪水填充存活检查', 2000]
];
for (const [mode, name, n] of rules) {
  const r = trial(mode, n, 0, 15, 400000);
  const tag = r.deaths === 0 ? '' : '   ← 会漏网';
  console.log(`  ${name.padEnd(42)}  ${String(r.deaths + '/' + n).padEnd(12)} ${r.avg}${tag}`);
}

console.log('\n  —— 换一组随机种子复测（证明不是运气好）——');
for (const [mode, name, n] of [[21, '抄近路条件是「落点领先蛇尾 > 蛇长」', 1000], [20, '抄近路条件是「跳过格数 ≤ 剩余空间一半」', 2000], [12, '最终方案：三层降级 + 洪水填充存活检查', 2000]]) {
  const r = trial(mode, n, 555, 15, 400000);
  console.log(`  ${name.padEnd(42)}  ${String(r.deaths + '/' + n).padEnd(12)} ${r.avg}${r.deaths ? '   ← 会漏网' : ''}`);
}

if (FULL) {
  console.log('\n=== 4. 满盘挑战模式（13）：吃满 400 格，200 局 ===');
  const r = trial(13, 200, 7, COLS * ROWS, 300000);
  console.log(`  通关 ${r.wins} / 200   死亡 ${r.deaths}   平均 ${r.avg} 步${r.deaths === 0 ? '  ✅' : '  ❌'}`);
} else {
  console.log('\n（加 --full 参数可以额外验证"满盘挑战"模式）');
}
