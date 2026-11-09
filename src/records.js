'use strict';
const KEY = 'duo.records.v1';
const GOMOKU_KEY = 'duo.gomoku.records.v1';
const empty = () => ({ version: 1, rounds: 0, draws: 0, X: { wins: 0, bestMoves: null }, O: { wins: 0, bestMoves: null } });
function valid(value) {
  return value && value.version === 1 && Number.isSafeInteger(value.rounds) && value.rounds >= 0 &&
    Number.isSafeInteger(value.draws) && value.draws >= 0 && ['X','O'].every(p => value[p] &&
      Number.isSafeInteger(value[p].wins) && value[p].wins >= 0 &&
      (value[p].bestMoves === null || (Number.isInteger(value[p].bestMoves) && value[p].bestMoves >= 3 && value[p].bestMoves <= 5))) &&
    value.draws + value.X.wins + value.O.wins === value.rounds;
}
function read(storage, key, validate, fallback) {
  try {
    const value = JSON.parse(storage.get(key) || 'null');
    return validate(value) ? value : fallback();
  } catch { return fallback(); }
}
function load(storage) { return read(storage, KEY, valid, empty); }

const emptyGomoku = () => ({ rounds: 0, draws: 0, black: 0, white: 0 });
function loadGomoku(storage) {
  return read(storage, GOMOKU_KEY, value => value &&
    ['rounds', 'draws', 'black', 'white'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0) &&
    value.rounds === value.draws + value.black + value.white, emptyGomoku);
}

function recordGomoku(records, game) {
  if (!game.winner && !game.draw) return records;
  const outcome = game.winner || 'draws';
  return { ...records, rounds: records.rounds + 1, [outcome]: records[outcome] + 1 };
}
function multiplayerKey(id, count) { return `duo.${id}.${count}.records.v1`; }
function loadMultiplayer(storage, id, count) {
  const validCount = value => Number.isSafeInteger(value) && value >= 0;
  return read(storage, multiplayerKey(id, count), value => value &&
    validCount(value.rounds) && validCount(value.draws) &&
    Array.isArray(value.wins) && value.wins.length === count && value.wins.every(validCount) &&
    value.rounds === value.draws + value.wins.reduce((sum, wins) => sum + wins, 0),
  () => ({ rounds: 0, draws: 0, wins: Array(count).fill(0) }));
}

function recordMultiplayer(records, game) {
  const wins = records.wins.slice();
  if (!game.draw) wins[game.winner]++;
  return { rounds: records.rounds + 1, draws: records.draws + (game.draw ? 1 : 0), wins };
}
function record(records, game) {
  if (!game.winner && !game.draw) return records;
  const next = JSON.parse(JSON.stringify(records)); next.rounds++;
  if (game.draw) next.draws++;
  else { const p = next[game.winner]; p.wins++; const moves = game.board.filter(v => v === game.winner).length; p.bestMoves = p.bestMoves === null ? moves : Math.min(p.bestMoves, moves); }
  return next;
}
function save(storage, records, key = KEY) { try { storage.set(key, JSON.stringify(records)); return true; } catch { return false; } }
module.exports = { KEY, GOMOKU_KEY, empty, load, loadGomoku, record, recordGomoku, multiplayerKey, loadMultiplayer, recordMultiplayer, save };
