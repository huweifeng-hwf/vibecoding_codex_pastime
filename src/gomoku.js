'use strict';
const SIZE = 13;
const POINTS = SIZE * SIZE;
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function other(player) {
  return player === 'black' ? 'white' : 'black';
}

function createGame(first = 'black') {
  return { board: Array(POINTS).fill(null), turn: first, winner: null,
    draw: false, line: [], moves: 0, last: null };
}

function winningLine(board, index, player) {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  for (const [dr, dc] of DIRECTIONS) {
    const line = [index];
    for (const sign of [-1, 1]) {
      let r = row + sign * dr;
      let c = col + sign * dc;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === player) {
        line.push(r * SIZE + c);
        r += sign * dr;
        c += sign * dc;
      }
    }
    if (line.length >= 5) return line;
  }
  return [];
}

function play(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= POINTS ||
      state.winner || state.draw || state.board[index]) return state;
  const board = state.board.slice();
  board[index] = state.turn;
  const line = winningLine(board, index, state.turn);
  const moves = state.moves + 1;
  return { board, moves, line, last: index, turn: other(state.turn),
    winner: line.length ? state.turn : null, draw: !line.length && moves === POINTS };
}

module.exports = { SIZE, createGame, play, other };
