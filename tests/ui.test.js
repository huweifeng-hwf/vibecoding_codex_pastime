const {test}=require('node:test');const assert=require('node:assert/strict');const {start}=require('../src/app');
function fixture(){let tap,resize,data,fail=false;const labels=[];const ctx={fillRect(){},setTransform(){},fillText(t){labels.push(t);}};const canvas={getContext:()=>ctx};start({canvas,size:()=>({width:390,height:844,dpr:2}),storage:{get:()=>data,set:(k,v)=>{if(fail)throw Error();data=v;}},onTap:f=>tap=f,onResize:f=>resize=f,confirm:(m,yes)=>yes()});return {labels,tap:(x,y)=>tap(x,y),resize:()=>resize(),get data(){return JSON.parse(data);},fail:()=>fail=true};}
test('大厅到获胜、重复点击只记一次、重开与战绩页',()=>{const f=fixture();f.tap(110,228);for(const [x,y] of [[78,228],[78,344],[195,228],[195,344],[312,228]])f.tap(x,y);assert.equal(f.data.rounds,1);assert.equal(f.data.X.wins,1);f.tap(312,228);assert.equal(f.data.rounds,1);f.resize();assert.equal(f.data.rounds,1);assert.ok(f.labels.includes('玩家 X 获胜！'));f.tap(195,650);f.tap(195,490);assert.ok(f.labels.includes('玩家 X · 1 胜'));});
test('存储失败仍能结算并显示提示',()=>{const f=fixture();f.fail();f.tap(110,228);for(const [x,y] of [[78,228],[78,344],[195,228],[195,344],[312,228]])f.tap(x,y);assert.ok(f.labels.some(t=>t.includes('保存失败')));});

test('小屏五子棋单击落子、取消退出、再战及战绩隔离', () => {
  const { KEY, GOMOKU_KEY } = require('../src/records');
  const legacy = JSON.stringify({
    version: 1, rounds: 1, draws: 0,
    X: { wins: 1, bestMoves: 3 }, O: { wins: 0, bestMoves: null },
  });
  const storage = new Map([[KEY, legacy]]);
  let tap, accept;
  const labels = [];
  const stones = [];
  const writes = [];
  const ctx = {
    fillRect() {}, setTransform() {}, beginPath() {}, fill() {},
    fillText(label) { labels.push(label); },
    arc(x, y) { stones.push([x, y]); },
  };
  start({
    canvas: { getContext: () => ctx },
    size: () => ({ width: 320, height: 650, dpr: 2, safeBottom: 34 }),
    storage: {
      get: key => storage.get(key),
      set: (key, value) => { writes.push(key); storage.set(key, value); },
    },
    onTap: handler => { tap = (x, y) => { labels.length = stones.length = 0; handler(x, y); }; },
    onResize() {},
    confirm: (_, yes) => { accept = yes; },
  });
  tap(235, 228);
  assert.ok(labels.includes('黑方落子'));
  assert.ok(labels.includes('轻点空交叉点落子'));
  tap(289, 409);
  assert.ok(labels.includes('白方落子'));
  assert.equal(stones.length, 1);
  assert.ok(stones[0][0] > 280 && stones[0][1] > 400);
  tap(289, 409);
  tap(12, 151);
  assert.deepEqual(writes, []);
  tap(160, 550);
  assert.equal(typeof accept, 'function');

  for (let i = 0; i < 4; i++) {
    tap(31 + i * 21.54, 387);
    tap(289 - (i + 1) * 21.54, 409);
  }
  assert.ok(labels.includes('黑方获胜！'));
  tap(31, 151);
  assert.deepEqual(writes, [GOMOKU_KEY]);
  assert.deepEqual(JSON.parse(storage.get(GOMOKU_KEY)), { rounds: 1, draws: 0, black: 1, white: 0 });
  assert.equal(storage.get(KEY), legacy);

  tap(160, 509);
  assert.ok(labels.includes('白方落子'));
  tap(160, 509);
  accept();
  assert.ok(labels.includes('白方落子'));
  tap(160, 550);
  accept();
  tap(160, 489);
  assert.ok(labels.includes('最快获胜：3 次落子'));
  tap(125, 155);
  assert.ok(labels.includes('黑方 · 1 胜'));
  assert.ok(labels.includes('白方 · 0 胜'));
});
