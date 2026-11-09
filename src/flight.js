'use strict';

const GRID_SIZE = 9;
const TRACK_SEGMENT = [[3,0], [4,0], [5,0], [5,1], [5,2], [5,3], [6,3], [7,3]];
const LAP = TRACK_SEGMENT.length * 4;
const FINISH = LAP + 3;
const HANGAR = -1;
// Each player's wind marker is separate from all four launch cells.
const WIND = 14;
const JUMP = 4;
const DRIFT = 2;

function trackEffect(index) {
  const offset = index % TRACK_SEGMENT.length;
  if (offset === 3) return 'supply';
  if (offset === 7) return 'turbulence';
  return null;
}

function rotate(x, y, quarter) {
  for (let i = 0; i < quarter; i++) [x, y] = [GRID_SIZE - 1 - y, x];
  return [x, y];
}

function trackPoint(index) {
  const segment = TRACK_SEGMENT.length;
  return rotate(...TRACK_SEGMENT[index % segment], Math.floor(index / segment));
}

function publicIndex(quarter, progress) {
  return (quarter * TRACK_SEGMENT.length + 2 + progress) % LAP;
}

function planePoint(quarter, plane, progress) {
  if (progress === HANGAR) {
    const [x,y] = rotate(1,1,quarter);
    return [x + plane - 0.5,y];
  }
  if (progress >= LAP) return rotate(4, progress - LAP + 1, quarter);
  return trackPoint(publicIndex(quarter, progress));
}

function createGame(count, first = 0) {
  return {
    quarters: count === 2 ? [0, 2] : Array.from({ length: count }, (_, seat) => seat),
    planes: Array.from({ length: count }, () => [HANGAR, HANGAR]),
    first, turn: first, die: null, lastRoll: null, lastRollBy: null, lastMove: null, winner: null, notice: '',
  };
}

function describeMove(game, plane, die = game.die) {
  const own = game.planes[game.turn];
  const progress = own[plane];
  if (progress === FINISH) return { reason: '已到终点' };
  if (progress === HANGAR && die % 2 !== 0) return { reason: '起飞需要 2、4 或 6' };
  const rolledTo = progress === HANGAR ? 0 : progress + die;
  if (rolledTo > FINISH) return { reason: '点数超过终点' };
  const otherPlane = own[1 - plane];
  const quarter = game.quarters[game.turn];
  const effect = rolledTo < LAP ? trackEffect(publicIndex(quarter, rolledTo)) : null;
  const wind = rolledTo === WIND && otherPlane !== WIND + JUMP;
  const drift = effect === 'turbulence' && otherPlane !== rolledTo - DRIFT;
  const next = wind ? rolledTo + JUMP : drift ? rolledTo - DRIFT : rolledTo;
  if (next !== FINISH && next === otherPlane) return { reason: '落点有己方飞机' };

  let capture = null;
  if (next < LAP) {
    const landing = publicIndex(quarter, next);
    game.planes.forEach((pair, seat) => {
      if (seat === game.turn) return;
      pair.forEach((position, other) => {
        if (position >= 0 && position < LAP && publicIndex(game.quarters[seat], position) === landing) {
          capture = { seat, plane: other };
        }
      });
    });
  }
  if (wind) return { next, capture, action: `顺风 +${JUMP} 格`, via: rolledTo };
  if (effect === 'supply') return { next, capture, action: '补给', extraRoll: true };
  if (effect === 'turbulence') {
    return drift ? { next, capture, action: `乱流退 ${DRIFT} 格`, via: rolledTo } :
      { next, capture, action: '乱流退路被占' };
  }
  const action = progress === HANGAR ? '起飞' : next === FINISH ? '到达终点' :
    next >= LAP && progress < LAP ? '进入返航道' : `前进 ${die} 格`;
  return { next, capture, action };
}

function roll(game, die) {
  if (game.winner !== null || game.die !== null || !Number.isInteger(die) || die < 1 || die > 6) return game;
  if ([0, 1].some(plane => !describeMove(game, plane, die).reason)) {
    return { ...game, die, lastRoll: die, lastRollBy: game.turn, notice: '' };
  }
  const inHangar = game.planes[game.turn].every(position => position === HANGAR);
  return { ...game, turn: (game.turn + 1) % game.planes.length, lastRoll: die, lastRollBy: game.turn,
    notice: inHangar ? '起飞需要偶数，已换人' : '无棋可走，已换人' };
}

function moveOption(game, plane) {
  if (game.winner !== null || game.die === null || (plane !== 0 && plane !== 1)) return null;
  return describeMove(game, plane);
}

function move(game, plane) {
  const option = moveOption(game, plane);
  if (!option || option.reason) return game;
  const { next, capture, action, extraRoll } = option;
  const planes = game.planes.map(pair => pair.slice());
  planes[game.turn][plane] = next;
  if (capture) planes[capture.seat][capture.plane] = HANGAR;

  const winner = planes[game.turn].every(progress => progress === FINISH) ? game.turn : null;
  const again = game.die === 6 || extraRoll;
  const turn = again || winner !== null ? game.turn : (game.turn + 1) % planes.length;
  const label = plane === 0 ? 'A' : 'B';
  let notice = capture ? `${label} ${action} · 撞回 ${capture.seat + 1} 号` : `${label} ${action}`;
  if (again && winner === null) notice += ' · 再掷一次';
  return { ...game, planes, winner, turn, die: null, notice, lastMove: { seat: game.turn, plane } };
}

module.exports = {
  GRID_SIZE, LAP, FINISH, HANGAR, WIND, JUMP, rotate, trackPoint, trackEffect, planePoint, createGame, roll, moveOption, move,
};
