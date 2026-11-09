'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SIZE, createGame, play } = require('../src/gomoku');

test('五子棋从边缘判定横、竖和两条斜向胜线', () => {
  for (const line of [
    [0, 1, 2, 3, 4],
    [12, 25, 38, 51, 64],
    [0, 14, 28, 42, 56],
    [12, 24, 36, 48, 60],
  ]) {
    let game = createGame();
    line.forEach((index, move) => {
      game = play(game, index);
      if (move < 4) game = play(game, 160 + move);
    });
    assert.equal(game.winner, 'black');
    assert.deepEqual(new Set(game.line), new Set(line));
    assert.equal(play(game, 100), game);
  }
});

test('五子棋允许长连，拒绝越界和重复落子，横线不跨行', () => {
  let game = createGame('white');
  assert.equal(play(game, -1), game);
  assert.equal(play(game, SIZE * SIZE), game);
  for (const [i, index] of [0, 1, 3, 4, 5, 2].entries()) {
    game = play(game, index);
    if (i < 5) {
      assert.equal(play(game, index), game);
      game = play(game, [160, 161, 163, 164, 166][i]);
    }
  }
  assert.equal(game.winner, 'white');
  assert.equal(game.line.length, 6);

  game = createGame();
  for (const [i, index] of [10, 11, 12, 13, 14].entries()) {
    game = play(game, index);
    if (i < 4) game = play(game, 160 + i);
  }
  assert.equal(game.winner, null);
});

test('五子棋满盘判平，最后一手成线时优先判胜', () => {
  const game = createGame();
  game.board = game.board.map((_, i) =>
    (Math.floor(i / SIZE) + 2 * (i % SIZE)) % 4 < 2 ? 'black' : 'white');
  const last = SIZE * SIZE - 1;
  game.board[last] = null;
  game.moves = last;
  const draw = play(game, last);
  assert.equal(draw.draw, true);
  assert.equal(draw.winner, null);
  assert.equal(play(draw, last), draw);

  game.board.fill('black', last - 4, last);
  const win = play(game, last);
  assert.equal(win.winner, 'black');
  assert.equal(win.draw, false);
});
