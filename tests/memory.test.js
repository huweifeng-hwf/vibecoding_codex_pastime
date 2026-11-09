'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Memory = require('../src/memory');
const { start } = require('../src/app');
const { KEY, GOMOKU_KEY, JOURNAL_KEY, recordMultiplayer } = require('../src/records');

const keepOrder = () => 0.999;

test('翻牌配对并列第一记平局，终局拒绝翻牌', () => {
  let game = Memory.createGame(2, 0, keepOrder);
  for (let pair = 0; pair < 8; pair++) {
    if (pair === 4) {
      game = Memory.hideMismatch(Memory.flip(Memory.flip(game, 4), 5));
      assert.equal(game.turn, 1);
    }
    game = Memory.flip(Memory.flip(game, pair), pair + 8);
  }
  assert.deepEqual(game.scores, [4, 4]);
  assert.equal(game.draw, true);
  assert.equal(game.winner, null);
  assert.equal(Memory.flip(game, 0), game);
  assert.deepEqual(recordMultiplayer({ rounds: 0, draws: 0, wins: [0, 0] }, game),
    { rounds: 1, draws: 1, wins: [0, 0] });
});

test('三人和四人回合循环，失败期间拒绝第三张和重复翻牌', () => {
  for (const count of [3, 4]) {
    let game = Memory.createGame(count, 0, keepOrder);
    for (let turn = 0; turn < count; turn++) {
      assert.equal(game.turn, turn);
      game = Memory.flip(game, 0);
      assert.equal(Memory.flip(game, 0), game);
      game = Memory.flip(game, 1);
      assert.equal(Memory.flip(game, 2), game);
      assert.equal(game.turn, turn);
      game = Memory.hideMismatch(game);
    }
    assert.equal(game.turn, 0);
  }
});

function fixture(storage, writes) {
  let tap;
  let frame = [];
  const ctx = {
    fillRect() {},
    fillText(label,x,y) { frame.push({ label,x,y }); },
    setTransform() {},
  };
  start({
    canvas: { getContext: () => ctx },
    size: () => ({ width: 320, height: 650, dpr: 2, safeBottom: 34 }),
    storage: {
      get: key => storage.get(key),
      set: (key,value) => { storage.set(key,value); writes.push(key); },
    },
    onTap: handler => { tap = handler; },
    onResize() {},
    confirm: (_, yes) => yes(),
  });
  const click = (x,y) => {
    const previous = frame;
    frame = [];
    tap(x,y);
    if (frame.length === 0) frame = previous;
  };
  return {
    click,
    press(label) {
      const item = frame.find(entry => entry.label === label);
      assert.ok(item, `找不到 ${label}`);
      click(item.x,item.y);
    },
    has(label) { return frame.some(entry => entry.label === label); },
    cards() { return frame.filter(entry => entry.label === '?'); },
  };
}

test('小屏从大厅完成四人对局并再战，按人数保存和重新读取战绩', t => {
  t.mock.method(Math,'random',keepOrder);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const legacy = '{"version":1,"rounds":1,"draws":0,"X":{"wins":1,"bestMoves":3},"O":{"wins":0,"bestMoves":null}}';
  const gomoku = '{"rounds":1,"draws":0,"black":1,"white":0}';
  const storage = new Map([[KEY, legacy], [GOMOKU_KEY, gomoku]]);
  const writes = [];
  const ui = fixture(storage,writes);
  ui.press('翻牌配对');
  ui.press('4 人');
  ui.press('开始配对');
  assert.ok(ui.has('轮到玩家 1'));
  assert.ok(ui.has('4 号 · 0 对'));
  const cards = ui.cards();
  const flip = index => ui.click(cards[index].x,cards[index].y);
  flip(0);
  flip(1);
  flip(2);
  assert.equal(ui.cards().length,14);
  t.mock.timers.tick(850);
  assert.ok(ui.has('轮到玩家 2'));

  for (let index = 0; index < 8; index++) {
    flip(index);
    flip(index+8);
  }
  assert.ok(ui.has('玩家 2获胜！'));
  assert.ok(ui.has('2 号 · 8 对'));
  flip(0);
  assert.deepEqual(writes,[JOURNAL_KEY]);
  ui.press('再来一局 · 轮换先手');
  assert.ok(ui.has('轮到玩家 2'));
  assert.equal(ui.cards().length,16);
  flip(0);
  flip(1);
  ui.press('重新开局（不计战绩）');
  t.mock.timers.tick(850);
  assert.ok(ui.has('轮到玩家 2'));
  assert.equal(ui.cards().length,16);
  ui.press('返回大厅');
  ui.press('翻牌配对');
  ui.press('3 人');
  ui.press('开始配对');
  assert.ok(ui.has('3 号 · 0 对'));
  assert.equal(ui.has('4 号 · 0 对'),false);
  ui.press('返回大厅');
  ui.press('翻牌配对');
  ui.press('开始配对');
  assert.ok(ui.has('2 号 · 0 对'));
  assert.equal(ui.has('3 号 · 0 对'),false);
  assert.deepEqual(writes,[JOURNAL_KEY]);

  const reopened = fixture(storage,writes);
  reopened.press('本机战绩');
  assert.ok(reopened.has('最快获胜：3 次落子'));
  reopened.press('五子棋');
  assert.ok(reopened.has('黑方 · 1 胜'));
  reopened.press('翻牌配对');
  assert.ok(reopened.has('完成 0 局 · 平局 0 局'));
  reopened.press('3 人');
  assert.ok(reopened.has('完成 0 局 · 平局 0 局'));
  reopened.press('4 人');
  assert.ok(reopened.has('完成 1 局 · 平局 0 局'));
  assert.ok(reopened.has('玩家 2 · 1 胜'));
  assert.equal(storage.get(KEY),legacy);
  assert.equal(storage.get(GOMOKU_KEY),gomoku);
});
