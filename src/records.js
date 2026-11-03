'use strict';
const KEY = 'duo.records.v1';
const empty = () => ({ version: 1, rounds: 0, draws: 0, X: { wins: 0, bestMoves: null }, O: { wins: 0, bestMoves: null } });
function valid(value) {
  return value && value.version === 1 && Number.isSafeInteger(value.rounds) && value.rounds >= 0 &&
    Number.isSafeInteger(value.draws) && value.draws >= 0 && ['X','O'].every(p => value[p] &&
      Number.isSafeInteger(value[p].wins) && value[p].wins >= 0 &&
      (value[p].bestMoves === null || (Number.isInteger(value[p].bestMoves) && value[p].bestMoves >= 3 && value[p].bestMoves <= 5))) &&
    value.draws + value.X.wins + value.O.wins === value.rounds;
}
function load(storage) {
  try { const value = JSON.parse(storage.get(KEY) || 'null'); return valid(value) ? value : empty(); } catch { return empty(); }
}
function record(records, game) {
  if (!game.winner && !game.draw) return records;
  const next = JSON.parse(JSON.stringify(records)); next.rounds++;
  if (game.draw) next.draws++;
  else { const p = next[game.winner]; p.wins++; const moves = game.board.filter(v => v === game.winner).length; p.bestMoves = p.bestMoves === null ? moves : Math.min(p.bestMoves, moves); }
  return next;
}
function save(storage, records) { try { storage.set(KEY, JSON.stringify(records)); return true; } catch { return false; } }
module.exports = { KEY, empty, load, record, save };
