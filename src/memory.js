'use strict';

const GRID_SIZE = 4;
const SYMBOLS = ['★', '●', '▲', '◆', '■', '✚', '☀', '♥'];

function createGame(count, first = 0, random = Math.random) {
  const cards = [...SYMBOLS, ...SYMBOLS];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return {
    cards, first, turn: first, scores: Array(count).fill(0),
    owners: Array(cards.length).fill(null), open: [], winner: null, draw: false,
  };
}

function flip(game, index) {
  if (game.winner !== null || game.draw || game.open.length === 2 ||
      !Number.isInteger(index) || index < 0 || index >= game.cards.length ||
      game.owners[index] !== null || game.open[0] === index) return game;

  const open = [...game.open, index];
  if (open.length === 1 || game.cards[open[0]] !== game.cards[index]) return { ...game, open };

  const owners = game.owners.slice();
  owners[open[0]] = owners[index] = game.turn;
  const scores = game.scores.slice();
  scores[game.turn]++;
  if (owners.includes(null)) return { ...game, owners, scores, open: [] };

  const max = Math.max(...scores);
  const winner = scores.indexOf(max);
  const draw = scores.indexOf(max, winner + 1) !== -1;
  return { ...game, owners, scores, open: [], winner: draw ? null : winner, draw };
}

function hideMismatch(game) {
  if (game.open.length !== 2) return game;
  return { ...game, open: [], turn: (game.turn + 1) % game.scores.length };
}

module.exports = { GRID_SIZE, createGame, flip, hideMismatch };
