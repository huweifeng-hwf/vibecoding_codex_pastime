'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Flight = require('../src/flight');
const { start } = require('../src/app');
const { multiplayerKey } = require('../src/records');

test('飞行棋无棋可走时换人，掷 6 起飞后再掷，防止重复掷骰和叠子', () => {
  let game = Flight.createGame(3, 2);
  game = Flight.roll(game, 5);
  assert.equal(game.turn, 0);
  assert.match(game.notice, /无棋可走/);
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
  game.planes = [[0, Flight.HANGAR], [13, Flight.HANGAR]];
  game = Flight.move(Flight.roll(game, 1), 0);
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

test('小屏飞行棋选四人、完整结算、再战轮换及按人数读取战绩', t => {
  let die = 6;
  t.mock.method(Math, 'random', () => (die - 0.5) / 6);
  const flightKey = multiplayerKey('flight', 4);
  const memoryKey = multiplayerKey('memory', 4);
  const memoryRecord = '{"rounds":1,"draws":0,"wins":[0,0,1,0]}';
  const storage = new Map([[memoryKey, memoryRecord]]);
  const writes = [];
  let tap;
  let labels = new Map();
  function launch() {
    start({
      canvas: { getContext: () => ({
        fillRect() {}, setTransform() {},
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
  }

  launch();
  press('飞行棋');
  press('4 人');
  press('开始飞行');
  assert.ok(labels.has('4 号 · 0/2'));
  for (const plane of ['A','B']) {
    die = 6;
    for (let i=0; i<5; i++) {
      press('掷骰子');
      press(i === 0 ? `1${plane}` : `移动飞机 ${plane}`);
    }
    die = 2;
    press('掷骰子');
    press(`移动飞机 ${plane}`);
    if (plane === 'A') {
      assert.ok(labels.has('1 号 · 1/2'));
      die = 1;
      for (let i=0; i<3; i++) press('掷骰子');
      assert.ok(labels.has('轮到玩家 1'));
    }
  }
  assert.ok(labels.has('玩家 1获胜！'));
  assert.ok(labels.has('1 号 · 2/2'));
  assert.deepEqual(writes,[flightKey]);
  press('再来一局 · 轮换先手');
  assert.ok(labels.has('轮到玩家 2'));
  press('重新开局（不计战绩）');
  assert.ok(labels.has('轮到玩家 2'));
  press('返回大厅');
  assert.deepEqual(writes,[flightKey]);

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
