const {test}=require('node:test');const assert=require('node:assert/strict');const {start}=require('../src/app');
function fixture(){let tap,resize,data,fail=false;const labels=[];const ctx={fillRect(){},setTransform(){},fillText(t){labels.push(t);}};const canvas={getContext:()=>ctx};start({canvas,size:()=>({width:390,height:844,dpr:2}),storage:{get:()=>data,set:(k,v)=>{if(fail)throw Error();data=v;}},onTap:f=>tap=f,onResize:f=>resize=f,confirm:(m,yes)=>yes()});return {labels,tap:(x,y)=>tap(x,y),resize:()=>resize(),get data(){return JSON.parse(data);},fail:()=>fail=true};}
test('大厅到获胜、重复点击只记一次、重开与战绩页',()=>{const f=fixture();f.tap(195,275);for(const [x,y] of [[78,228],[78,344],[195,228],[195,344],[312,228]])f.tap(x,y);assert.equal(f.data.rounds,1);assert.equal(f.data.X.wins,1);f.tap(312,228);assert.equal(f.data.rounds,1);f.resize();assert.equal(f.data.rounds,1);assert.ok(f.labels.includes('玩家 X 获胜！'));f.tap(195,650);f.tap(195,490);assert.ok(f.labels.includes('玩家 X · 1 胜'));});
test('存储失败仍能结算并显示提示',()=>{const f=fixture();f.fail();f.tap(195,275);for(const [x,y] of [[78,228],[78,344],[195,228],[195,344],[312,228]])f.tap(x,y);assert.ok(f.labels.some(t=>t.includes('保存失败')));});

test('小屏五子棋预选、确认、取消退出、再战及战绩隔离', () => {
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
    arc(x, y) { stones.push([x, y, this.globalAlpha]); },
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
  tap(160, 410);
  assert.ok(labels.includes('黑方落子'));
  tap(289, 409);
  assert.equal(stones[0][2], 0.55);
  tap(31, 151);
  assert.equal(stones.length, 1);
  assert.ok(stones[0][0] < 40);
  tap(160, 451);
  assert.ok(labels.includes('白方落子'));
  assert.equal(stones[0][2], 1);
  tap(160, 570);
  assert.equal(typeof accept, 'function');
  tap(31, 151);
  tap(160, 451);
  assert.deepEqual(writes, []);
  for (let i = 0; i < 4; i++) {
    tap(31 + i * 21.54, 172);
    tap(160, 451);
    tap(31 + (i + 1) * 21.54, 151);
    tap(160, 451);
  }
  assert.ok(labels.includes('黑方获胜！'));
  tap(160, 451);
  assert.deepEqual(writes, [GOMOKU_KEY]);
  assert.deepEqual(JSON.parse(storage.get(GOMOKU_KEY)), { rounds: 1, draws: 0, black: 1, white: 0 });
  assert.equal(storage.get(KEY), legacy);

  tap(160, 509);
  assert.ok(labels.includes('白方落子'));
  tap(160, 509);
  accept();
  assert.ok(labels.includes('白方落子'));
  tap(160, 570);
  accept();
  tap(160, 489);
  assert.ok(labels.includes('最快获胜：3 次落子'));
  tap(235, 155);
  assert.ok(labels.includes('黑方 · 1 胜'));
  assert.ok(labels.includes('白方 · 0 胜'));
});
