'use strict';

function finishTurn(game,scores,highest) {
  const turns = game.turns+1;
  if (turns < game.limit) return { ...game, scores, turns, turn: (game.turn+1)%scores.length };
  const best = highest ? Math.max(...scores) : Math.min(...scores);
  const winner = scores.indexOf(best);
  const draw = scores.lastIndexOf(best) !== winner;
  return { ...game, scores, turns, draw, winner: draw ? null : winner };
}

const TILES = 0x1ff;
const bits = Array.from({length:9},(_,i) => 1<<i);
const total = mask => bits.reduce((sum,bit,i) => sum+((mask&bit) ? i+1 : 0),0);
function canMake(mask,target) {
  for (let part=mask;part;part=(part-1)&mask) {
    if (total(part) === target) return true;
  }
  return false;
}

function closeBoxTurn(game,notice) {
  const scores = game.scores.slice();
  scores[game.turn] += total(game.open);
  return finishTurn({ ...game, open:TILES, picked:0, dice:null, notice },scores,false);
}

const Box = {
  total,
  createGame: (count,first = 0) => ({
    first, turn:first, turns:0, limit:count*2, scores:Array(count).fill(0),
    open:TILES, picked:0, dice:null, lastDice:null, winner:null, draw:false, notice:'',
  }),
  roll(game,dice) {
    if (game.winner !== null || game.draw || game.dice || dice.length !== 2 ||
        !dice.every(die => Number.isInteger(die) && die >= 1 && die <= 6)) return game;
    const next = { ...game, dice, lastDice:dice, notice:'' };
    return canMake(game.open,dice[0]+dice[1]) ? next : closeBoxTurn(next,`无组合 · 记 ${total(game.open)} 分`);
  },
  pick(game,index) {
    const bit = bits[index];
    if (!game.dice || !bit || !(game.open&bit)) return game;
    return { ...game, picked:game.picked^bit };
  },
  close(game) {
    if (!game.dice || total(game.picked) !== game.dice[0]+game.dice[1]) return game;
    const open = game.open&~game.picked;
    const next = { ...game, open, picked:0, dice:null, notice:'已盖数字牌，继续掷骰' };
    return open ? next : closeBoxTurn(next,'成功封盒 · 记 0 分');
  },
};

const SECTORS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
function dartScore(x,y) {
  const distance = Math.hypot(x,y);
  if (distance > 1) return 0;
  if (distance <= 0.05) return 50;
  if (distance <= 0.11) return 25;
  const sector = Math.round(Math.atan2(x,-y)*10/Math.PI);
  const multiplier = distance >= 0.91 ? 2 : distance >= 0.54 && distance <= 0.63 ? 3 : 1;
  return SECTORS[(sector+20)%20]*multiplier;
}
const Darts = {
  SECTORS, score: dartScore,
  createGame: (count,first = 0) => ({
    first, turn:first, turns:0, limit:count*9, scores:Array(count).fill(0),
    winner:null, draw:false, marks:[], lastPoints:null,
  }),
  throw(game,x,y) {
    if (game.winner !== null || game.draw || !Number.isFinite(x) || !Number.isFinite(y)) return game;
    const points = dartScore(x,y);
    const scores = game.scores.slice();
    scores[game.turn] += points;
    const marks = [...(game.turns%3 ? game.marks : []),{x,y,points}];
    if (game.turns%3 === 2) return finishTurn({ ...game, marks, lastPoints:points },scores,true);
    return { ...game, turns:game.turns+1, marks, lastPoints:points, scores };
  },
};

module.exports = { Box, Darts };
