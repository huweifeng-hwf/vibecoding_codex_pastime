const {test}=require('node:test');const assert=require('node:assert/strict');const {start}=require('../src/app');const {JOURNAL_KEY}=require('../src/records');
function fixture(){let tap,resize,data,fail=false;const labels=[];const ctx={fillRect(){},setTransform(){},fillText(t){labels.push(t);}};const canvas={getContext:()=>ctx};start({canvas,size:()=>({width:390,height:844,dpr:2}),storage:{get:()=>data,set:(k,v)=>{if(fail)throw Error();data=v;}},onTap:f=>tap=f,onResize:f=>resize=f,confirm:(m,yes)=>yes()});return {labels,tap:(x,y)=>tap(x,y),resize:()=>resize(),get data(){return JSON.parse(data);},fail:()=>fail=true};}
test('大厅到获胜、重复点击只记一次、重开与战绩页',()=>{const f=fixture();f.tap(110,228);for(const [x,y] of [[78,228],[78,344],[195,228],[195,344],[312,228]])f.tap(x,y);assert.equal(f.data.matches.length,1);assert.equal(f.data.matches[0].winner,0);f.tap(312,228);assert.equal(f.data.matches.length,1);f.resize();assert.equal(f.data.matches.length,1);assert.ok(f.labels.includes('玩家 X 获胜！'));f.tap(195,650);f.tap(195,490);assert.ok(f.labels.includes('玩家 X · 1 胜'));});
test('存储失败仍能结算并显示提示',()=>{const f=fixture();f.fail();f.tap(110,228);for(const [x,y] of [[78,228],[78,344],[195,228],[195,344],[312,228]])f.tap(x,y);assert.ok(f.labels.some(t=>t.includes('保存失败')));});

test('小屏五子棋单击落子、取消退出、再战及战绩隔离', () => {
  const { KEY } = require('../src/records');
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
  assert.deepEqual(writes, [JOURNAL_KEY]);
  assert.equal(JSON.parse(storage.get(JOURNAL_KEY)).matches[0].game, 'gomoku');
  assert.equal(storage.get(KEY), legacy);

  tap(160, 509);
  assert.ok(labels.includes('白方落子'));
  tap(160, 509);
  accept();
  assert.ok(labels.includes('白方落子'));
  tap(160, 550);
  accept();
  tap(235, 228);
  assert.ok(labels.includes('黑方落子'));
  tap(160, 550);
  accept();
  tap(160, 489);
  assert.ok(labels.includes('最快获胜：3 次落子'));
  tap(125, 155);
  assert.ok(labels.includes('黑方 · 1 胜'));
  assert.ok(labels.includes('白方 · 0 胜'));
});

test('面对面布局保持棋盘坐标，两端可操作并共用战绩', () => {
  const storage = new Map();
  let labels, tap, reversed = false, anchor;
  let writes = 0;
  const canvas = { getContext: () => ({
    fillRect() {}, setTransform() {}, save() {},
    translate(x,y) { anchor = {x,y}; },
    rotate(angle) { assert.equal(angle,Math.PI); reversed = true; },
    restore() { reversed = false; },
    fillText(label,x,y) { labels.push({ label, reversed, ...(reversed ? anchor : {x,y}) }); },
  }) };
  function launch() {
    labels = [];
    start({
      canvas, size: () => ({width:320,height:650,dpr:2,safeBottom:34}),
      storage: {
        get: key => storage.get(key),
        set: (key,value) => {
          storage.set(key,value);
          if (key === JOURNAL_KEY) writes++;
        },
      },
      onTap: handler => { tap = (x,y) => { labels = []; handler(x,y); }; },
      onResize() {}, confirm: () => assert.fail('面对面使用双向确认面板'),
    });
  }
  const find = (label, direction = false) => {
    const match = labels.find(item => item.label === label && item.reversed === direction);
    assert.ok(match, label);
    return match;
  };
  const press = (label,direction) => {
    const {x,y} = find(label,direction);
    tap(x,y);
  };

  launch();
  press('井字棋');
  tap(67,217);
  press('座位：并排 · 切换面对面');
  find('你执 O · 轮到你',true);
  find('你执 X · 等对方落子');
  const stone = find('✕');
  press('回大厅',true);
  find('请确认操作',true);
  press('取消',true);
  assert.deepEqual(find('✕'),stone);
  tap(stone.x,stone.y+93);
  find('你执 X · 轮到你');
  assert.deepEqual(find('✕'),stone);
  tap(stone.x+93,stone.y);
  tap(stone.x+93,stone.y+93);
  tap(stone.x+186,stone.y);
  find('X获胜！',true);
  find('X获胜！');
  assert.equal(writes,1);
  press('再来一局',true);
  find('你执 O · 轮到你',true);
  press('改为并排',true);
  find('轮到玩家 O');
  assert.equal(writes,1);

  press('座位：并排 · 切换面对面');
  press('重开',true);
  press('确认',true);
  find('你执 O · 轮到你',true);
  press('回大厅',true);
  press('确认',true);
  press('井字棋');
  find('你执 X · 轮到你');
  press('改为并排',true);
  launch();
  press('井字棋');
  find('座位：并排 · 切换面对面');
  press('座位：并排 · 切换面对面');
  launch();
  press('井字棋');
  find('你执 O · 等对方落子',true);
  assert.equal(JSON.parse(storage.get(JOURNAL_KEY)).matches[0].winner,0);
});

test('本机档案开局、换座、改名、删除与恢复后，历史和旧座位战绩保持完整', () => {
  const { KEY } = require('../src/records');
  const legacy = JSON.stringify({
    version: 1, rounds: 1, draws: 0,
    X: { wins: 1, bestMoves: 3 }, O: { wins: 0, bestMoves: null },
  });
  const storage = new Map([[KEY,legacy]]);
  let labels, tap, prompt, confirm;
  function launch() {
    labels = new Map();
    start({
      canvas: { getContext: () => ({
        fillRect() {}, setTransform() {},
        fillText(label,x,y) { labels.set(label,[x,y]); },
      }) },
      size: () => ({ width: 390, height: 844, dpr: 2 }),
      storage: { get: key => storage.get(key), set: (key,value) => storage.set(key,value) },
      onTap: handler => { tap = (x,y) => { labels.clear(); handler(x,y); }; },
      onResize() {},
      prompt: (_,accept) => { prompt = value => { labels.clear(); accept(value); }; },
      confirm: (_,accept) => { confirm = accept; },
    });
  }
  function press(label) {
    const point = labels.get(label);
    assert.ok(point,`找不到 ${label}`);
    tap(...point);
  }
  function chooseGame() {
    press('选玩家开局');
    press('井字棋');
  }
  function winAsX() {
    press('开始对局');
    for (const point of [[78,228],[78,344],[195,228],[195,344],[312,228]]) tap(...point);
  }

  launch();
  chooseGame();
  press('X · 游客');
  press('新建玩家');
  prompt('小林');
  press('O · 游客');
  assert.ok(!labels.has('小林'));
  press('新建玩家');
  prompt('小周');
  winAsX();
  press('本局记录');
  assert.ok(labels.has('X · 小林 · 先手'));
  press('返回逐局历史');
  press('返回大厅');

  chooseGame();
  assert.ok(labels.has('沿用上次玩家'));
  press('X · 游客');
  press('小周');
  press('O · 游客');
  press('小林');
  winAsX();
  press('返回大厅');

  launch();
  press('本机战绩');
  assert.ok(labels.has('完成 3 局 · 平局 0 局'));
  assert.equal(storage.get(KEY),legacy);
  assert.deepEqual(JSON.parse(storage.get(JOURNAL_KEY)).matches.map(match => match.players),[[1,2],[2,1]]);
  press('逐局历史');
  press('小周获胜 · 2 人 ›');
  assert.ok(labels.has('X · 小周 · 先手'));
  assert.ok(labels.has('共 5 手'));
  press('返回逐局历史');
  press('好友交手榜');
  assert.ok(labels.has('1. 小林 · 1 胜 / 2 局'));
  assert.ok(labels.has('1. 小周 · 1 胜 / 2 局'));
  press('选好友 A');
  press('小林');
  press('选好友 B');
  press('小周');
  assert.ok(labels.has('共同完成 2 局'));
  assert.ok(labels.has('平局 0 · 其他玩家获胜 0'));
  press('五子棋');
  assert.ok(labels.has('共同完成 0 局'));
  press('玩家档案');
  press('小林 ›');
  assert.ok(labels.has('2 局 · 1 胜'));
  press('编辑昵称');
  prompt('林同学');
  assert.ok(labels.has('林同学'));
  press('用该玩家开局');
  press('井字棋');
  assert.ok(labels.has('X · 林同学'));
  press('返回');
  press('返回玩家档案');
  press('返回玩家档案');
  press('林同学 ›');
  press('删除玩家');
  confirm();
  assert.ok(!labels.has('林同学 ›'));
  assert.deepEqual(JSON.parse(storage.get(JOURNAL_KEY)).archivedProfiles,[1]);
  launch();
  chooseGame();
  press('沿用上次玩家');
  assert.ok(labels.has('X · 小周'));
  assert.ok(labels.has('O · 游客'));
  press('O · 游客');
  assert.ok(!labels.has('林同学'));
  press('返回');
  press('返回');
  press('返回大厅');
  press('玩家档案');
  press('已删除');
  press('林同学 ›');
  assert.ok(labels.has('2 局 · 1 胜'));
  press('查看对局历史');
  assert.ok(labels.has('仅看 林同学 · 清除'));
  assert.ok(labels.has('林同学获胜 · 2 人 ›'));
  press('好友交手榜');
  assert.ok(labels.has('1. 小周 · 1 胜 / 2 局'));
  assert.ok(!labels.has('1. 林同学 · 1 胜 / 2 局'));
  press('选好友 A');
  assert.ok(!labels.has('林同学'));
  press('返回');
  press('玩家档案');
  press('林同学 ›');
  press('恢复玩家');
  assert.ok(labels.has('林同学 ›'));
  const journal = JSON.parse(storage.get(JOURNAL_KEY));
  assert.deepEqual(journal.archivedProfiles,[]);
  assert.deepEqual(journal.matches.map(match => match.players),[[1,2],[2,1]]);
});
