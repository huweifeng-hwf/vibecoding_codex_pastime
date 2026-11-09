'use strict';

const GRID_SIZE = 7;
// Progress starts on the shared track, then enters two private cells before finishing.
const LAP = 24;
const FINISH = 26;
const HANGAR = -1;

function rotate(x, y, quarter) {
  for (let i = 0; i < quarter; i++) [x, y] = [GRID_SIZE - 1 - y, x];
  return [x, y];
}

function trackPoint(index) {
  return rotate(index % 6, 0, Math.floor(index / 6));
}

function publicIndex(quarter, progress) {
  return (quarter * 6 + 4 + progress) % LAP;
}

function planePoint(quarter, plane, progress) {
  if (progress === HANGAR) return rotate(1 + plane, 1, quarter);
  if (progress >= LAP) return rotate(3, progress - LAP + 1, quarter);
  return trackPoint(publicIndex(quarter, progress));
}

function createGame(count, first = 0) {
  return {
    quarters: count === 2 ? [0, 2] : Array.from({ length: count }, (_, seat) => seat),
    planes: Array.from({ length: count }, () => [HANGAR, HANGAR]),
    first, turn: first, die: null, lastRoll: null, winner: null, notice: '',
  };
}

function destination(game, plane, die) {
  const own = game.planes[game.turn];
  const progress = own[plane];
  if (progress === FINISH || (progress === HANGAR && die !== 6)) return null;
  const next = progress === HANGAR ? 0 : progress + die;
  if (next > FINISH || (next !== FINISH && next === own[1 - plane])) return null;
  return next;
}

function roll(game, die) {
  if (game.winner !== null || game.die !== null || !Number.isInteger(die) || die < 1 || die > 6) return game;
  if ([0, 1].some(plane => destination(game, plane, die) !== null)) {
    return { ...game, die, lastRoll: die, notice: '' };
  }
  return { ...game, turn: (game.turn + 1) % game.planes.length, lastRoll: die, notice: '无棋可走，已换人' };
}

function canMove(game, plane) {
  return game.winner === null && game.die !== null && (plane === 0 || plane === 1) &&
    destination(game, plane, game.die) !== null;
}

function move(game, plane) {
  if (!canMove(game, plane)) return game;
  const next = destination(game, plane, game.die);
  const planes = game.planes.map(pair => pair.slice());
  planes[game.turn][plane] = next;
  let notice = '';
  if (next < LAP) {
    const landing = publicIndex(game.quarters[game.turn], next);
    planes.forEach((pair, seat) => {
      if (seat === game.turn) return;
      pair.forEach((progress, other) => {
        if (progress >= 0 && progress < LAP && publicIndex(game.quarters[seat], progress) === landing) {
          pair[other] = HANGAR;
          notice = `撞回 ${seat + 1} 号玩家的飞机`;
        }
      });
    });
  }
  const winner = planes[game.turn].every(progress => progress === FINISH) ? game.turn : null;
  const turn = game.die === 6 || winner !== null ? game.turn : (game.turn + 1) % planes.length;
  if (game.die === 6 && winner === null) notice = notice ? `${notice} · 再掷一次` : '掷到 6 · 再掷一次';
  return { ...game, planes, winner, turn, die: null, notice };
}

module.exports = { GRID_SIZE, LAP, FINISH, HANGAR, trackPoint, planePoint, createGame, roll, canMove, move };
