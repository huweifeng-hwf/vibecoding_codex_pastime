'use strict';
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function createGame(first = 'X') {
  return { board: Array(9).fill(null), turn: first, first, winner: null, draw: false, line: [], moves: 0 };
}
function play(state, index) {
  if (!Number.isInteger(index) || index < 0 || index > 8 || state.winner || state.draw || state.board[index]) return state;
  const board = state.board.slice(); board[index] = state.turn;
  const line = LINES.find(cells => cells.every(i => board[i] === state.turn));
  return { ...state, board, moves: state.moves + 1, winner: line ? state.turn : null,
    draw: !line && state.moves + 1 === 9, line: line || [], turn: state.turn === 'X' ? 'O' : 'X' };
}
module.exports = { createGame, play };
