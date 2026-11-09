'use strict';

const W = 1, H = 1.6;
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const opposite = seat => 1-seat;
const seatY = seat => seat === 0 ? H-0.15 : 0.15;
const BALL = 0.024, MALLET = 0.078, PADDLE = 0.134, GOAL = 0.17;
const body = (x,y) => ({x,y,vx:0,vy:0});

function resetVolley(game) {
  game.ball = body(0.5,H/2);
  game.paddles = [0,1].map(seat => ({
    ...body(0.5,seatY(seat)), targetX:0.5, targetY:seatY(seat),
  }));
  game.phase = 'ready';
  game.flatTime = 0;
}

function createArena(kind,first) {
  const game = {kind,first,turn:first,winner:null,scores:[0,0]};
  resetVolley(game);
  return game;
}
function aim(game,seat,x,y) {
  const pad = game.paddles[seat], hockey = game.kind === 'hockey';
  pad.targetX = clamp(x,hockey ? MALLET : PADDLE,W-(hockey ? MALLET : PADDLE));
  if (hockey) pad.targetY = clamp(y,seat === 0 ? H/2+MALLET : MALLET,seat === 0 ? H-MALLET : H/2-MALLET);
}

function startVolley(game) {
  if (game.phase !== 'ready') return;
  game.ball.vy = (game.turn === 0 ? -1 : 1)*(game.kind === 'hockey' ? 0.66 : 0.92);
  game.ball.vx = game.scores.reduce((a,b)=>a+b,0)%2 ? 0.25 : -0.25;
  game.phase = 'playing';
}
function scoreGoal(game,seat) {
  game.scores[seat]++;
  if (game.scores[seat] >= (game.kind === 'hockey' ? 5 : 7)) {
    game.winner = seat;
    game.phase = 'done';
    return;
  }
  game.turn = opposite(seat);
  resetVolley(game);
}
function arenaTick(game,dt) {
  const hockey = game.kind === 'hockey';
  for (const pad of game.paddles) {
    const dx = pad.targetX-pad.x, dy = pad.targetY-pad.y;
    const fraction = Math.min(1,3.6*dt/(Math.hypot(dx,dy)||1));
    pad.vx = dx*fraction/dt;
    pad.vy = dy*fraction/dt;
    pad.x += dx*fraction;
    pad.y += dy*fraction;
  }
  if (game.phase !== 'playing') return;
  const ball = game.ball, oldY = ball.y;
  ball.x += ball.vx*dt;
  ball.y += ball.vy*dt;
  if (ball.x < BALL || ball.x > W-BALL) {
    ball.x = clamp(ball.x,BALL,W-BALL);
    ball.vx *= -1;
  }
  if (!hockey) {
    const seat = ball.vy > 0 ? 0 : 1;
    const pad = game.paddles[seat], sign = seat === 0 ? 1 : -1;
    const edge = pad.y-sign*(BALL+0.013);
    if (sign*(oldY-edge) <= 0 && sign*(ball.y-edge) >= 0 && Math.abs(ball.x-pad.x) <= PADDLE+BALL) {
      const speed = Math.min(2.25,Math.hypot(ball.vx,ball.vy)*1.07);
      const angle = clamp((ball.x-pad.x)/PADDLE,-1,1)*1.05;
      ball.y = edge;
      ball.vx = Math.sin(angle)*speed;
      ball.vy = -sign*Math.cos(angle)*speed;
    }
  } else {
    for (const pad of game.paddles) {
      const dx = ball.x-pad.x, dy = ball.y-pad.y;
      const distance = Math.hypot(dx,dy);
      if (distance >= BALL+MALLET) continue;
      const nx = distance ? dx/distance : 0, ny = distance ? dy/distance : 1;
      ball.x = pad.x+nx*(BALL+MALLET);
      ball.y = pad.y+ny*(BALL+MALLET);
      const approach = (pad.vx-ball.vx)*nx+(pad.vy-ball.vy)*ny;
      if (approach > 0) {
        ball.vx += nx*approach*1.72;
        ball.vy += ny*approach*1.72;
      }
    }
    if (Math.abs(ball.x-0.5) > GOAL-BALL && (ball.y < BALL || ball.y > H-BALL)) {
      ball.y = clamp(ball.y,BALL,H-BALL);
      ball.vy *= -1;
    }
    const speed = Math.hypot(ball.vx,ball.vy);
    if (speed > 2.75) {
      ball.vx *= 2.75/speed;
      ball.vy *= 2.75/speed;
    }
    game.flatTime = Math.abs(ball.vy) < 0.05 ? game.flatTime+dt : 0;
    if (game.flatTime > 2) {
      ball.vy = ball.y < H/2 ? 0.20 : -0.20;
      game.flatTime = 0;
    }
  }
  if (ball.y < -BALL || ball.y > H+BALL) scoreGoal(game,ball.y < 0 ? 0 : 1);
}

function substeps(tick,seconds) {
  if (!(seconds > 0)) return;
  const count = Math.ceil(seconds*240);
  for (let i=0;i<count;i++) tick(seconds/count);
}
const Arena = {
  W,H,BALL,MALLET,PADDLE,GOAL,aim,serve:startVolley,
  pong: { createGame: (_,first=0) => createArena('pong',first) },
  hockey: { createGame: (_,first=0) => createArena('hockey',first) },
  step(game,seconds) {
    substeps(dt => { if (game.phase === 'playing') arenaTick(game,dt); },seconds);
  },
  readyAim(game,seat,x,y) {
    aim(game,seat,x,y);
    if (game.phase === 'ready') {
      const pad=game.paddles[seat];
      pad.x=pad.targetX;
      pad.y=pad.targetY;
    }
  },
};

const R = 0.029;
const POCKETS = [0,H/2,H].flatMap(y => [0,W].map(x => ({x,y})));
const group = id => id >= 1 && id <= 7 ? 0 : id >= 9 ? 1 : null;
const ballAt = (id,x,y) => ({...body(x,y),id});

function rack() {
  const balls = [ballAt(0,0.5,H*0.79)];
  const order = [1,10,2,3,8,11,12,4,13,5,6,14,7,15,9];
  let index=0;
  for (let row=0;row<5;row++) {
    for (let col=0;col<=row;col++) {
      balls.push(ballAt(order[index++],0.5+(col-row/2)*(2*R+0.0015),H*0.30-row*(Math.sqrt(3)*R+0.0015)));
    }
  }
  return balls;
}

function legalCue(game,x,y) {
  return x >= R && x <= W-R && y >= R && y <= H-R &&
    !POCKETS.some(p=>Math.hypot(x-p.x,y-p.y)<0.08) &&
    !game.balls.some(b=>b.id!==0 && Math.hypot(x-b.x,y-b.y)<2*R+0.002);
}
function setCue(game,x,y) {
  const cue = game.balls.find(b=>b.id===0);
  if (cue) Object.assign(cue,body(x,y));
  else game.balls.unshift(ballAt(0,x,y));
}
function spotEight(game) {
  for (let row=1;row<=12;row++) {
    const y = H*row/13;
    if (!game.balls.some(b=>Math.hypot(0.5-b.x,y-b.y)<2*R+0.002)) {
      game.balls.push(ballAt(8,0.5,y));
      return;
    }
  }
}
function settleShot(game) {
  const { shot,turn } = game;
  const own = game.groups[turn];
  const foul = shot.potted.includes(0) || shot.firstHit === null || (own === null ? shot.firstHit === 8 :
    shot.onEight ? shot.firstHit !== 8 : group(shot.firstHit) !== own);
  const sunkEight = shot.potted.includes(8);
  game.moves++;
  if (sunkEight && game.moves === 1) spotEight(game);
  else if (sunkEight) {
    game.winner = shot.onEight && !foul ? turn : opposite(turn);
    game.phase = 'done';
    game.notice = shot.onEight && !foul ? '合法打进 8 号球' : '提前打进 8 号球或犯规';
    return;
  }
  const coloured = shot.potted.filter(id=>group(id)!==null);
  if (!foul && own === null && coloured.length && game.moves > 1) {
    game.groups[turn] = group(coloured[0]);
    game.groups[opposite(turn)] = opposite(game.groups[turn]);
  }
  const keep = !foul && coloured.some(id=>game.groups[turn] === null || group(id) === game.groups[turn]);
  if (!keep) game.turn = opposite(turn);
  game.phase = foul ? 'inHand' : 'ready';
  game.notice = foul ? '犯规 · 对方摆母球' : keep ? '进球 · 继续击球' : '交换球权';
}
function poolTick(game,dt) {
  const {shot,balls} = game;
  const friction = Math.exp(-1.27*dt);
  for (let i=balls.length-1;i>=0;i--) {
    const b=balls[i];
    b.x+=b.vx*dt;
    b.y+=b.vy*dt;
    if (POCKETS.some(p=>Math.hypot(p.x-b.x,p.y-b.y)<0.060)) {
      shot.potted.push(b.id);
      balls.splice(i,1);
      continue;
    }
    if (b.x<R || b.x>W-R) { b.x=clamp(b.x,R,W-R); b.vx*=-0.82; }
    if (b.y<R || b.y>H-R) { b.y=clamp(b.y,R,H-R); b.vy*=-0.82; }
    b.vx*=friction;
    b.vy*=friction;
    if (Math.hypot(b.vx,b.vy)<0.014) b.vx=b.vy=0;
  }
  for (let i=0;i<balls.length;i++) for (let j=i+1;j<balls.length;j++) {
    const a=balls[i], b=balls[j];
    const dx=b.x-a.x, dy=b.y-a.y, distance=Math.hypot(dx,dy);
    if (distance>=2*R) continue;
    const nx=distance ? dx/distance : 1, ny=distance ? dy/distance : 0;
    const overlap=(2*R-distance)/2;
    a.x-=nx*overlap; a.y-=ny*overlap;
    b.x+=nx*overlap; b.y+=ny*overlap;
    const approach=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
    if (approach<=0) continue;
    if (shot.firstHit===null && (a.id===0 || b.id===0)) shot.firstHit = a.id || b.id;
    const impulse=approach*0.96;
    a.vx-=nx*impulse; a.vy-=ny*impulse;
    b.vx+=nx*impulse; b.vy+=ny*impulse;
  }
  shot.time+=dt;
  if (shot.time>=10 || balls.every(b=>b.vx===0&&b.vy===0)) {
    balls.forEach(b=>{b.vx=b.vy=0;});
    settleShot(game);
  }
}
const Pool = {
  W,H,R,POCKETS,group,
  createGame: (_,first=0) => ({
    first,turn:first,winner:null,phase:'ready',groups:[null,null],balls:rack(),moves:0,notice:'开球 · 球组未分配',
  }),
  place(game,x,y) {
    if (game.phase!=='inHand' || !legalCue(game,x,y)) return false;
    setCue(game,x,y);
    game.phase='ready';
    game.notice='母球已放置';
    return true;
  },
  shoot(game,dx,dy) {
    const pull=Math.hypot(dx,dy), cue=game.balls.find(b=>b.id===0);
    if (game.phase!=='ready' || !cue || !Number.isFinite(pull) || pull<0.03) return false;
    const velocity=Math.min(2.65,pull*8.5);
    cue.vx=dx/pull*velocity;
    cue.vy=dy/pull*velocity;
    const own=game.groups[game.turn];
    game.shot={time:0,firstHit:null,potted:[],onEight:own!==null && !game.balls.some(b=>group(b.id)===own)};
    game.phase='playing';
    game.notice='球在滚动';
    return true;
  },
  step(game,seconds) {
    substeps(dt=>{if (game.phase==='playing') poolTick(game,dt);},seconds);
  },
};

module.exports = { Arena, Pool };
