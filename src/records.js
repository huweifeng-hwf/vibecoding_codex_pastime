'use strict';
const { FINISH } = require('./flight');
const KEY = 'duo.records.v1';
const GOMOKU_KEY = 'duo.gomoku.records.v1';
const JOURNAL_KEY = 'duo.localJournal.v1';
const BOARD_SEATS = { ticTacToe: ['X','O'], gomoku: ['black','white'] };
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
  return recordTicTacToe(records, game.draw ? null : game.winner, game.board.filter(value => value === game.winner).length);
}
function recordTicTacToe(records, winner, moves) {
  const next = { ...records, rounds: records.rounds + 1 };
  if (winner === null) return { ...next, draws: next.draws + 1 };
  const { wins, bestMoves } = next[winner];
  return { ...next, [winner]: { wins: wins + 1, bestMoves: bestMoves === null ? moves : Math.min(bestMoves,moves) } };
}

function loadJournal(storage) {
  return read(storage, JOURNAL_KEY, value => {
    if (!Array.isArray(value?.profiles) || !Array.isArray(value.matches)) return false;
    const validId = id => Number.isInteger(id) && id > 0 && id <= value.profiles.length;
    if (value.archivedProfiles !== undefined &&
        (!Array.isArray(value.archivedProfiles) || !value.archivedProfiles.every(validId))) return false;
    const inSeats = (seat, count) => Number.isInteger(seat) && seat >= 0 && seat < count;
    return value.profiles.every(name => typeof name === 'string' && name.length > 0) &&
      value.matches.every(match => {
        if (!match || !Array.isArray(match.players)) return false;
        const { game, players, winner, first, endedAt, scores, moves, winnerMoves } = match;
        const count = players.length;
        const named = players.filter(id => id !== null);
        if (!named.every(validId) || new Set(named).size !== named.length ||
            !(winner === null || inSeats(winner,count)) || !inSeats(first,count) ||
            !Number.isSafeInteger(endedAt) || endedAt < 0 || endedAt > 8640000000000000) return false;
        if (game === 'ticTacToe' || game === 'gomoku') {
          return count === 2 && Number.isInteger(moves) &&
            (game !== 'ticTacToe' || winner === null || (Number.isInteger(winnerMoves) && winnerMoves >= 3 && winnerMoves <= 5));
        }
        return (game === 'flight' || game === 'memory') && count >= 2 && count <= 4 &&
          Array.isArray(scores) && scores.length === count && scores.every(Number.isInteger) &&
          (game !== 'flight' || winner !== null);
      });
  }, () => ({ profiles: [], matches: [] }));
}

function finishedMatch(id, game, players, first, endedAt = Date.now()) {
  const seats = BOARD_SEATS[id];
  const winner = game.winner === null || !seats ? game.winner : seats.indexOf(game.winner);
  const match = { game: id, players: players.slice(), first, winner, endedAt };
  if (id === 'memory') match.scores = game.scores.slice();
  else if (id === 'flight') match.scores = game.planes.map(pair => pair.filter(progress => progress === FINISH).length);
  else match.moves = game.moves;
  if (id === 'ticTacToe' && winner !== null) match.winnerMoves = game.board.filter(value => value === game.winner).length;
  return match;
}

function recordSeatMatch(records, match) {
  const { game, winner } = match;
  if (game === 'ticTacToe') {
    return recordTicTacToe(records, winner === null ? null : BOARD_SEATS[game][winner], match.winnerMoves);
  }
  if (game === 'gomoku') return recordGomoku(records, { winner: BOARD_SEATS[game][winner], draw: winner === null });
  return recordMultiplayer(records, { winner, draw: winner === null });
}

function friendResults(matches, a, b) {
  const stats = { rounds: 0, aWins: 0, bWins: 0, draws: 0, otherWins: 0 };
  if (a === null || b === null || a === b) return stats;
  for (const match of matches) {
    if (!match.players.includes(a) || !match.players.includes(b)) continue;
    stats.rounds++;
    const winner = match.players[match.winner];
    if (match.winner === null) stats.draws++;
    else if (winner === a) stats.aWins++;
    else if (winner === b) stats.bWins++;
    else stats.otherWins++;
  }
  return stats;
}

function friendStandings(matches) {
  const standings = new Map();
  for (const { players, winner } of matches) {
    const named = players.filter(id => id !== null);
    if (named.length < 2) continue;
    for (const id of named) {
      const stats = standings.get(id) || { id, rounds: 0, wins: 0, draws: 0 };
      stats.rounds++;
      if (winner === null) stats.draws++;
      else if (players[winner] === id) stats.wins++;
      standings.set(id,stats);
    }
  }
  return [...standings.values()].sort((a,b) => b.wins-a.wins || a.id-b.id);
}

function save(storage, records, key = KEY) { try { storage.set(key, JSON.stringify(records)); return true; } catch { return false; } }
module.exports = {
  KEY, GOMOKU_KEY, JOURNAL_KEY, BOARD_SEATS, empty, load, loadGomoku, record, recordGomoku, multiplayerKey,
  loadMultiplayer, recordMultiplayer, loadJournal, finishedMatch, recordSeatMatch, friendResults, friendStandings, save,
};
