const acorn = require('acorn');
const fs = require('fs');
const src = fs.readFileSync('server/lan-share.js', 'utf8');
const lines = src.split('\n');

// 每次删 50 行做 acorn parse，看错误信息变化
function truncate(keep) {
  return lines.slice(0, keep).join('\n') + '\n/* end */\n'; // 用合法 stmt 收尾
}

for (let k = 706; k >= 1; k -= 50) {
  const s = truncate(k);
  try { acorn.parse(s, { ecmaVersion: 2022, sourceType: 'script' }); console.log('OK k=' + k); break; }
  catch (e) { console.log('k=' + k + ' → ' + e.message + ' L' + e.loc.line); }
}