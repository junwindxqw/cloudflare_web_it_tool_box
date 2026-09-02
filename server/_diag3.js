const acorn = require('acorn');
const fs = require('fs');
const src = fs.readFileSync('server/lan-share.js', 'utf8');
const lines = src.split('\n');

// 找出每个 async function / function / createServer 的起始行
const funcStartLines = [];
lines.forEach((l, i) => {
  if (/^(async function |function )/.test(l)) funcStartLines.push(i + 1);
});
console.log('function start lines count:', funcStartLines.length);
console.log('last 5 starts:', funcStartLines.slice(-5));

// 策略：单独抽取 function body（从 func start 到下一个 func start 之间，或到文件末尾）。
// 替换为 ...用 wrapper，括号应该匹配；如果不匹配就是这一段错。
function testBlock(startLine) {
  const startIdx = startLine - 1;
  // 找下一段起始
  const nextIdx = (() => {
    for (const s of funcStartLines) if (s > startLine) return s - 1;
    return lines.length;
  })();
  const blockLines = lines.slice(startIdx, nextIdx);
  // 用 'x' 包裹做顶层语句测试；如果 block 本来就是函数体，需要手动加 function wrapper
  const wrapped = 'function _probe() {\n' + blockLines.join('\n') + '\n}';
  try { acorn.parse(wrapped, { ecmaVersion: 2022, sourceType: 'script' }); return 'OK'; }
  catch (e) { return e.message + ' L' + e.loc.line; }
}

let bad = [];
for (const s of funcStartLines) {
  const r = testBlock(s);
  if (r !== 'OK') bad.push({ start: s, err: r });
}
console.log('--- bad functions ---');
bad.forEach(b => console.log('start line', b.start, '→', b.err));