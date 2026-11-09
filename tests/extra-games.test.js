'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Connect,Race } = require('../src/grid-games');
const { Box,Darts } = require('../src/score-games');
const { Arena,Pool } = require('../src/table-games');
const Records = require('../src/records');
const games = require('../src/extra-games');

test('重力连四落到底部，识别斜线并拒绝满列或终局落子', () => {
  let game = Connect.createGame(2);
  for (const column of [0,1,1,2,4,2,2,3,4,3,5,3,3]) game = Connect.drop(game,column);
  assert.equal(game.winner,0);
  assert.deepEqual([...game.line].sort((a,b)=>a-b),[17,23,29,35]);
  assert.equal(Connect.drop(game,0),game);
  let full = Connect.createGame(2);
  for(let i=0;i<6;i++) full = Connect.drop(full,6);
  assert.equal(Connect.drop(full,6),full);
});

test('挡路竞速支持越子和受阻后斜跳，封死路线和交叉墙不能落下', () => {
  const game = { ...Race.createGame(2), pawns:[40,31] };
  assert.ok(Race.destinations(game).includes(22));
  const blocked = { ...game, walls:[{x:4,y:2,axis:'h'}] };
  assert.ok(!Race.destinations(blocked).includes(22));
  assert.ok([30,32].every(cell=>Race.destinations(blocked).includes(cell)));
  assert.equal(Race.place(blocked,{x:4,y:2,axis:'v'}),blocked);

  const enclosed = { ...Race.createGame(2), pawns:[72,4], walls:[{x:0,y:7,axis:'v'}] };
  assert.equal(Race.wallError(enclosed,{x:0,y:7,axis:'h'}),'墙不能重叠或交叉');
  const trapped = { ...enclosed, walls:[{x:0,y:6,axis:'v'},{x:0,y:5,axis:'h'},{x:1,y:7,axis:'v'}] };
  assert.equal(Race.wallError(trapped,{x:0,y:7,axis:'h'}),'必须给双方留一条路');
  const finish = Race.move({ ...game, pawns:[13,3] },4);
  assert.equal(finish.winner,0);
});

test('掷骰封盒验证数字和，无解自动结分，各玩家轮次相同', () => {
  let game = Box.roll(Box.createGame(3,2),[1,1]);
  assert.equal(Box.choices(game),1<<1);
  assert.equal(Box.close(game),game);
  game = Box.close(Box.pick(game,1));
  assert.equal(Box.total(game.open),43);
  assert.equal(game.turn,2);
  game = Box.roll(game,[1,1]);
  assert.equal(game.turn,0);
  assert.deepEqual(game.scores,[0,0,43]);
  for(let i=0;i<5;i++) game = Box.roll({ ...game, open:1 },[6,6]);
  assert.equal(game.turns,6);
  assert.deepEqual(game.scores,[2,2,44]);
  assert.equal(game.draw,true);

  const combo=Box.roll(Box.createGame(2),[2,3]);
  const picked=Box.pick(combo,0);
  assert.ok(Box.choices(picked)&(1<<3));
  assert.equal(Box.choices(picked)&(1<<1),0);
  assert.equal(Box.choices(Box.pick(picked,3)),0);
});

test('飞镖计单双三倍、内外靶心和脱靶，四人打完三轮才结算', () => {
  for (const [x,y,score] of [[0,0,50],[0,-0.08,25],[0,-0.4,20],[0,-0.60,60],[0,-0.96,40],[2,2,0]]) {
    assert.equal(Darts.score(x,y),score);
  }
  let game = Darts.createGame(4,3);
  for(let i=0;i<36;i++) game = Darts.throw(game,0,game.turn===3 ? 0 : -0.4);
  assert.deepEqual(game.scores,[180,180,180,450]);
  assert.equal(game.winner,3);
  assert.equal(Darts.throw(game,0,0),game);
});

test('Pong 挡板反弹并计分，空气曲棍球球门外反弹且圆拍不能过中线', () => {
  const pong = Arena.pong.createGame(2,0);
  Arena.serve(pong);
  Object.assign(pong.ball,{x:0.5,y:0.2,vx:0,vy:-1});
  Arena.step(pong,0.10);
  assert.ok(pong.ball.vy>0);
  assert.ok(pong.impact?.life>0);
  Arena.readyAim(pong,0,0.72,Arena.H);
  assert.equal(pong.paddles[0].x,0.72);
  pong.scores[0]=6;
  Object.assign(pong.ball,{x:0.02,y:0.07,vx:0,vy:-1});
  Arena.step(pong,0.13);
  assert.deepEqual(pong.scores,[7,0]);
  assert.equal(pong.winner,0);

  const hockey = Arena.hockey.createGame(2,1);
  Arena.readyAim(hockey,0,0.85,0.1);
  Arena.readyAim(hockey,1,0.3,1.3);
  assert.ok(hockey.paddles[0].y>Arena.H/2);
  assert.ok(hockey.paddles[1].y<Arena.H/2);
  Arena.serve(hockey);
  Object.assign(hockey.ball,{x:0.15,y:0.07,vx:0,vy:-1});
  Arena.step(hockey,0.13);
  assert.ok(hockey.ball.vy>0);
  Object.assign(hockey.ball,{x:0.5,y:0.05,vx:0,vy:-1});
  Arena.step(hockey,0.13);
  assert.deepEqual(hockey.scores,[1,0]);
});

test('八球台球开球会碰撞球堆，母球落袋后对方自由摆球，黑八判胜负', () => {
  const pool=Pool.createGame(2,0);
  assert.equal(pool.balls.length,16);
  const cue=pool.balls[0];
  const contact=Pool.guide(pool,cue,0,-1);
  assert.equal(contact.x,cue.x);
  assert.equal(contact.y,pool.balls[1].y+2*Pool.R);
  assert.equal(Pool.power(0.03),0);
  assert.ok(Pool.power(0.1)<Pool.power(0.25));
  assert.equal(Pool.power(0.5),1);
  assert.ok(Pool.shoot(pool,0,-0.4));
  Pool.step(pool,1);
  assert.equal(pool.shot.firstHit,1);
  assert.ok(pool.balls.some(ball=>ball.id!==0 && Math.hypot(ball.vx,ball.vy)>0.02));

  const ball=(id,x,y)=>({id,x,y,vx:0,vy:0});
  const scratch={ ...Pool.createGame(2,0), balls:[ball(0,0.07,0.04),ball(1,0.5,0.5)] };
  assert.ok(Pool.shoot(scratch,-0.25,0));
  Pool.step(scratch,1);
  assert.equal(scratch.phase,'inHand');
  assert.equal(scratch.turn,1);
  assert.equal(Pool.place(scratch,0.5,0.5),false);
  assert.equal(Pool.place(scratch,0.5,1),true);

  for (const [legal,winner] of [[true,0],[false,1]]) {
    const balls=[ball(0,0.5,0.1),ball(8,0.09,0.04)];
    if(!legal) balls.push(ball(1,0.8,0.7));
    const state={ ...Pool.createGame(2,0), moves:3, groups:[0,1], balls };
    assert.ok(Pool.shoot(state,-0.4,-0.059));
    for (let i=0;i<100&&state.phase==='playing';i++) Pool.step(state,0.1);
    assert.equal(state.winner,winner);
  }
});

test('新增七款游戏的成绩能和旧对局共同读取并用于好友榜', () => {
  const matches = games.map(item => {
    const game = item.rules.createGame(2,0);
    game.winner=0;
    return Records.finishedMatch(item.id,game,[1,2],0,7);
  });
  matches.push(Records.finishedMatch('ticTacToe',
    { winner:'X',board:['X','X','X'],moves:5 },[1,2],0,8));
  const stored = { profiles:['甲','乙'],matches };
  const decoded = Records.loadJournal({get:()=>JSON.stringify(stored)});
  assert.deepEqual(decoded,stored);
  assert.equal(Records.friendResults(decoded.matches,1,2).aWins,8);
});
