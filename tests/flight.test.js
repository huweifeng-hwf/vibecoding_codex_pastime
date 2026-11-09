'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Flight = require('../src/flight');
const { start } = require('../src/app');
const { JOURNAL_KEY, multiplayerKey } = require('../src/records');

test('飞行棋无棋可走时换人，掷 6 起飞后再掷，防止重复掷骰和叠子', () => {
  let game = Flight.createGame(3, 2);
  game = Flight.roll(game, 5);
  assert.equal(game.turn, 0);
  assert.match(game.notice, /起飞需要偶数，已换人/);
  game = Flight.roll(game, 6);
  assert.equal(Flight.roll(game, 6), game);
  game = Flight.move(game, 0);
  assert.deepEqual(game.planes[0], [0, Flight.HANGAR]);
  assert.equal(game.turn, 0);
  game = Flight.roll(game, 6);
  assert.equal(Flight.move(game, 1), game);
  game = Flight.move(game, 0);
  assert.equal(game.planes[0][0], 6);
  assert.equal(game.turn, 0);
});

test('飞行棋公共航道撞机回库，终点需刚好，第二架到达时结束', () => {
  let game = Flight.createGame(2);
  assert.deepEqual(game.quarters, [0, 2]);
  game.planes = [[0, Flight.HANGAR], [2 + Flight.LAP/2, Flight.HANGAR]];
  game = Flight.roll(game, 2);
  assert.deepEqual(Flight.moveOption(game, 0), { next: 2, capture: { seat: 1, plane: 0 }, action: '前进 2 格' });
  game = Flight.move(game, 0);
  assert.deepEqual(game.planes[1], [Flight.HANGAR, Flight.HANGAR]);
  assert.match(game.notice, /撞回 2 号/);
  assert.equal(game.turn, 1);

  game = Flight.createGame(2);
  game.planes = [[Flight.FINISH, Flight.FINISH-1], [Flight.HANGAR, Flight.HANGAR]];
  const pass = Flight.roll(game, 2);
  assert.equal(pass.turn, 1);
  assert.equal(pass.die, null);
  const finished = Flight.move(Flight.roll(game, 1), 1);
  assert.equal(finished.winner, 0);
  assert.equal(Flight.roll(finished, 6), finished);
  assert.equal(Flight.move(finished, 1), finished);
});

test('补给落点可撞机并续掷，乱流按退后的最终落点撞机', () => {
  const game = Flight.createGame(2);
  game.planes = [[0,Flight.HANGAR],[1+Flight.LAP/2,Flight.HANGAR]];
  const supply = Flight.roll(game,1);
  assert.deepEqual(Flight.moveOption(supply,0),{
    next: 1, capture: {seat: 1, plane: 0}, action: '补给', extraRoll: true,
  });
  const supplied = Flight.move(supply,0);
  assert.equal(supplied.turn,0);
  assert.match(supplied.notice,/补给.*再掷一次/);

  game.planes = [[1,Flight.HANGAR],[3+Flight.LAP/2,5+Flight.LAP/2]];
  const turbulence = Flight.roll(game,4);
  assert.deepEqual(Flight.moveOption(turbulence,0),{
    next: 3, via: 5, capture: {seat: 1, plane: 0}, action: '乱流退 2 格',
  });
  const moved = Flight.move(turbulence,0);
  assert.deepEqual(moved.planes,[[3,Flight.HANGAR],[Flight.HANGAR,5+Flight.LAP/2]]);
  assert.equal(moved.turn,1);
  game.planes[0][1] = 3;
  assert.equal(Flight.moveOption(Flight.roll(game,4),0).next,5);
  game.planes[0][1] = 5;
  assert.equal(Flight.moveOption(Flight.roll(game,4),0).next,3);
});

test('十字航线闭合，四条返航道从各自入口连至终点', () => {
  const track = Array.from({length: Flight.LAP},(_,i) => Flight.trackPoint(i));
  const trackCells = new Set(track.map(point => point.join(',')));
  assert.equal(trackCells.size,Flight.LAP);
  const adjacent = (a,b) => Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]) === 1;
  track.forEach((point,i) => assert.ok(adjacent(point,track[(i+1)%Flight.LAP])));
  const launches = new Set(Array.from({length: 4},(_,q) => Flight.planePoint(q,0,0).join(',')));
  for (let quarter=0; quarter<4; quarter++) {
    let previous = Flight.planePoint(quarter,0,Flight.LAP-1);
    for (let progress=Flight.LAP; progress<=Flight.FINISH; progress++) {
      const point = Flight.planePoint(quarter,0,progress);
      assert.ok(adjacent(previous,point));
      assert.ok(!trackCells.has(point.join(',')));
      previous = point;
    }
    assert.deepEqual(previous,[4,4]);
    assert.ok(!launches.has(Flight.planePoint(quarter,0,Flight.WIND).join(',')));
  }
});

test('偶数可起飞，同色顺风落地撞机，己方占落点时停在星标', () => {
  for (const die of [2,4,6]) {
    const launched = Flight.move(Flight.roll(Flight.createGame(2),die),0);
    assert.equal(launched.planes[0][0],0);
    assert.equal(launched.turn,die === 6 ? 0 : 1);
  }
  const game = Flight.createGame(2);
  const boosted = Flight.WIND + Flight.JUMP;
  const opponentAt = progress => (progress + Flight.LAP/2)%Flight.LAP;
  game.planes = [[Flight.WIND-2,Flight.HANGAR],[opponentAt(Flight.WIND),opponentAt(boosted)]];
  const rolled = Flight.roll(game,2);
  assert.deepEqual(Flight.moveOption(rolled,0),{
    next: boosted, via: Flight.WIND, capture: {seat: 1, plane: 1}, action: '顺风 +4 格',
  });
  const moved = Flight.move(rolled,0);
  assert.deepEqual(moved.planes,[[boosted,Flight.HANGAR],[opponentAt(Flight.WIND),Flight.HANGAR]]);
  assert.match(moved.notice,/顺风 \+4 格 · 撞回 2 号/);

  game.planes[0][1] = boosted;
  assert.deepEqual(Flight.moveOption(Flight.roll(game,2),0),{
    next: Flight.WIND, capture: {seat: 1, plane: 0}, action: '前进 2 格',
  });
  game.planes[0][1] = Flight.WIND;
  assert.equal(Flight.moveOption(Flight.roll(game,2),0).next,boosted);
});

test('小屏飞行棋选四人、完整结算、再战轮换及按人数读取战绩', t => {
  let die = 6;
  t.mock.method(Math, 'random', () => (die - 0.5) / 6);
  t.mock.timers.enable({apis:['setTimeout']});
  const memoryKey = multiplayerKey('memory', 4);
  const memoryRecord = '{"rounds":1,"draws":0,"wins":[0,0,1,0]}';
  const storage = new Map([[memoryKey, memoryRecord]]);
  const writes = [];
  let tap;
  let labels = new Map();
  function launch() {
    start({
      canvas: { getContext: () => ({
        fillRect() {}, strokeRect() {}, setTransform() {}, beginPath() {}, arc() {}, fill() {},
        fillText(label,x,y) { labels.set(label,[x,y]); },
      }) },
      size: () => ({ width: 320, height: 568, dpr: 2, safeBottom: 34 }),
      storage: {
        get: key => storage.get(key),
        set: (key,value) => { storage.set(key,value); writes.push(key); },
      },
      onTap: handler => { tap = handler; },
      onResize() {},
      confirm: (_,yes) => yes(),
    });
  }
  function press(label) {
    assert.ok(labels.has(label), `找不到 ${label}`);
    const [x,y] = labels.get(label);
    labels = new Map();
    const scale = 568/650;
    tap(x*scale,y*scale);
    if (label === '掷骰子') {
      assert.ok(labels.has('掷骰中…'));
      assert.ok(!labels.has('飞机 A'));
      tap(x*scale,y*scale);
      t.mock.timers.tick(270);
      assert.ok(labels.has(String(die)));
    }
  }
  function movePlane(plane) {
    const piece = `1${plane}`;
    const before = labels.get(piece);
    const [x,y] = before;
    press(piece);
    assert.ok(labels.has('正在移动飞机'));
    assert.ok(!labels.has('掷骰子'));
    tap(x*568/650,y*568/650);
    for (let i=0; i<3; i++) t.mock.timers.tick(25);
    assert.notDeepEqual(labels.get(piece),before);
    assert.ok(labels.has('正在移动飞机'));
    for (let i=0; labels.has('正在移动飞机') && i<60; i++) {
      labels = new Map();
      t.mock.timers.tick(25);
    }
    assert.ok(!labels.has('正在移动飞机'));
  }

  launch();
  press('飞行棋');
  press('4 人');
  press('开始飞行');
  assert.ok(labels.has('4 号 · 0/2'));
  for (const plane of ['A','B']) {
    die = 6;
    for (let i=0; i<1+Math.floor(Flight.FINISH/6); i++) {
      press('掷骰子');
      if (i === 0) {
        assert.ok(labels.has('起飞'));
        assert.ok(labels.has(plane === 'A' ? 'A/B' : 'B'));
        const [x,y] = labels.get(`飞机 ${plane}`);
        tap(x*568/650,y*568/650);
        t.mock.timers.tick(270);
        assert.ok(!labels.has('正在移动飞机'));
        assert.ok(labels.has('点棋盘上的高亮飞机'));
      }
      movePlane(plane);
    }
    die = Flight.FINISH%6;
    press('掷骰子');
    movePlane(plane);
    if (plane === 'A') {
      assert.ok(labels.has('1 号 · 1/2'));
      die = 1;
      for (let i=0; i<3; i++) press('掷骰子');
      assert.ok(labels.has('轮到玩家 1'));
    }
  }
  assert.ok(labels.has('玩家 1获胜！'));
  assert.ok(labels.has('1 号 · 2/2'));
  assert.deepEqual(writes,[JOURNAL_KEY]);
  const [match] = JSON.parse(storage.get(JOURNAL_KEY)).matches;
  assert.deepEqual(match.players,[null,null,null,null]);
  assert.deepEqual(match.scores,[2,0,0,0]);
  press('再来一局 · 轮换先手');
  assert.ok(labels.has('轮到玩家 2'));
  press('重新开局（不计战绩）');
  assert.ok(labels.has('轮到玩家 2'));
  press('返回大厅');
  assert.deepEqual(writes,[JOURNAL_KEY]);

  labels = new Map();
  launch();
  press('本机战绩');
  press('飞行棋');
  assert.ok(labels.has('完成 0 局'));
  press('3 人');
  assert.ok(labels.has('完成 0 局'));
  press('4 人');
  assert.ok(labels.has('完成 1 局'));
  assert.ok(labels.has('玩家 1 · 1 胜'));
  press('翻牌配对');
  assert.ok(labels.has('玩家 3 · 1 胜'));
  assert.equal(storage.get(memoryKey),memoryRecord);
});
