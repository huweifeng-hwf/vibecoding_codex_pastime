'use strict';

const { Connect, Race } = require('./grid-games');
const { Box, Darts } = require('./score-games');
const { Arena, Pool } = require('./table-games');
const SEAT_INK = ['#ffad98','#80dfd4','#ffd67d','#c4b5ff'];
const POOL_INK = ['#fff8e6','#eec952','#5485ed','#eb706d','#a67bdd','#f49c51','#4eb98c','#8c4844','#141822'];

function createExtraUI({ctx,text,box,button,seatText,seatButton,roundControls,saveStatus,label,hit,update,animate,render}) {
  let input = null, drag = null, pointers = new Map(), wallMode = null, wallPreview = null;
  const muted = '#aab2cc';
  const done = game => game.winner !== null || game.draw;
  function reset() {
    input = drag = wallMode = wallPreview = null;
    pointers.clear();
  }
  function circle(x,y,r,fill) {
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function line(x1,y1,x2,y2,fill,width=1) {
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.lineWidth = width;
    ctx.strokeStyle = fill;
    ctx.stroke();
  }
  function cellButton(x,y,w,h,action) {
    hit({x,y,w,h,action});
  }
  function heading(game,cx,top) {
    const title = game.draw ? '平局' : game.winner === null ? `轮到 ${label(game.turn)}` : `${label(game.winner)} 获胜！`;
    text(title,cx,top+57,25,game.draw ? '#f5f1e9' : SEAT_INK[game.winner ?? game.turn]);
  }
  function scores(game,left,w,y,scoreLabel) {
    game.scores.forEach((score,seat) => {
      const width = w/game.scores.length;
      const x = left+seat*width;
      box(x+2,y,width-4,44,seat === game.turn && !done(game) ? '#344861' : '#202640');
      const name = label(seat);
      text(name,x+width/2,y+11,Math.min(13,(width-12)/[...name].length),SEAT_INK[seat]);
      text(scoreLabel(score),x+width/2,y+30,15);
    });
  }
  function footer(game,cx,left,w,y,hint) {
    text(done(game) ? saveStatus() : hint,cx,y+13,13,muted);
    roundControls(done(game),left,y+34,w);
  }
  function drawConnect(game,{cx,top,left,w,bottom}) {
    heading(game,cx,top);
    const y=top+114, cell=Math.min(w/Connect.COLUMNS,(bottom-y-150)/Connect.ROWS);
    const bx=cx-cell*Connect.COLUMNS/2;
    box(bx-3,y-3,cell*Connect.COLUMNS+6,cell*Connect.ROWS+6,'#274c73');
    for (let row=0;row<Connect.ROWS;row++) for(let col=0;col<Connect.COLUMNS;col++) {
      const index=row*Connect.COLUMNS+col, seat=game.board[index];
      const x=bx+(col+0.5)*cell, cy=y+(row+0.5)*cell;
      if (game.line.includes(index)) circle(x,cy,cell*0.46,'#fff9e9');
      circle(x,cy,cell*0.37,seat === null ? '#152740' : SEAT_INK[seat]);
    }
    for(let col=0;!done(game)&&col<Connect.COLUMNS;col++) {
      if (game.board[col] !== null) continue;
      text('▾',bx+(col+0.5)*cell,y-15,17,SEAT_INK[game.turn]);
      cellButton(bx+col*cell,y-26,cell,cell*Connect.ROWS+26,()=>update(Connect.drop(game,col)));
    }
    footer(game,cx,left,w,y+cell*Connect.ROWS+15,'点击一列落子，横、竖或斜着连成四枚');
  }
  function drawRace(game,{cx,top,left,w,bottom}) {
    heading(game,cx,top);
    const by=top+109, size=Math.min(w,bottom-by-222), cell=size/Race.SIZE, bx=cx-size/2;
    text(`1 号余墙 ${game.left[0]}  ·  2 号余墙 ${game.left[1]}`,cx,top+84,14,muted);
    const legal=wallMode ? [] : Race.destinations(game);
    for(let i=0;i<Race.SIZE*Race.SIZE;i++) {
      const x=bx+i%Race.SIZE*cell, y=by+Math.floor(i/Race.SIZE)*cell;
      const row=Math.floor(i/Race.SIZE);
      box(x+1,y+1,cell-2,cell-2,row===0?'#583f4a':row===8?'#2c5859':'#263a57');
      if (legal.includes(i)) {
        circle(x+cell/2,y+cell/2,cell*0.16,SEAT_INK[game.turn]);
        cellButton(x,y,cell,cell,()=>update(Race.move(game,i)));
      }
    }
    function paintWall(wall,color) {
      const x=bx+(wall.x+1)*cell, y=by+(wall.y+1)*cell, thick=Math.max(4,cell*0.17);
      if (wall.axis==='h') box(x-cell+2,y-thick/2,2*cell-4,thick,color);
      else box(x-thick/2,y-cell+2,thick,2*cell-4,color);
    }
    game.walls.forEach(wall=>paintWall(wall,'#f6d783'));
    if (wallMode && !done(game)) {
      for (let y=0;y<Race.SIZE-1;y++) for(let x=0;x<Race.SIZE-1;x++) {
        const px=bx+(x+1)*cell, py=by+(y+1)*cell;
        circle(px,py,cell*0.07,'#f6d783');
        cellButton(px-cell/2,py-cell/2,cell,cell,()=>{wallPreview={x,y,axis:wallMode};render();});
      }
      if (wallPreview) paintWall(wallPreview,Race.wallError(game,wallPreview)?'#ff8383':'#fff3af');
    }
    game.pawns.forEach((pawn,seat)=>{
      const x=bx+(pawn%Race.SIZE+0.5)*cell, y=by+(Math.floor(pawn/Race.SIZE)+0.5)*cell;
      circle(x,y,cell*0.33,SEAT_INK[seat]);
      text(String(seat+1),x,y,cell*0.42,'#152740');
    });
    const y=by+size+12;
    if (done(game)) { footer(game,cx,left,w,y,''); return; }
    const modes=[[null,'走棋'],['h','横墙'],['v','竖墙']], width=(w-12)/3;
    modes.forEach(([mode,title],i)=>{
      button(title,left+i*(width+6),y,width,39,()=>{
        wallMode=mode; wallPreview=null; render();
      },mode===wallMode?'#395a69':'#202640',14);
    });
    const error=wallPreview ? Race.wallError(game,wallPreview) : '';
    if (wallPreview && !error) button('确认筑墙',left,y+46,w,38,()=>{
      const next=Race.place(game,wallPreview);
      wallMode=wallPreview=null;
      update(next);
    },'#395a69',15);
    else text(error || (wallMode?'点交叉处预览墙的位置':'点高亮格走棋，先到对边获胜'),cx,y+64,13,muted);
    roundControls(false,left,y+95,w);
  }
  function dieFace(value,x,y,size) {
    box(x-size/2,y-size/2,size,size,'#f5ead6');
    text(String(value),x,y,size*0.60,'#172139');
  }
  function drawBox(game,{cx,top,left,w}) {
    heading(game,cx,top);
    scores(game,left,w,top+83,value=>value+' 分');
    const round=Math.min(2,Math.floor(game.turns/game.scores.length)+1);
    text(`第 ${round}/2 轮 · 总分较低者获胜`,cx,top+150,14,muted);
    if (game.lastDice) game.lastDice.forEach((die,i)=>dieFace(die,cx+(i-0.5)*66,top+199,54));
    else text('两颗骰子的和决定要盖的数字',cx,top+199,15,muted);
    const tile=Math.min(63,(w-18)/3), bx=cx-(tile*3+12)/2, by=top+242;
    for(let i=0;i<9;i++) {
      const open=game.open&(1<<i), picked=game.picked&(1<<i);
      const x=bx+i%3*(tile+6), y=by+Math.floor(i/3)*48;
      box(x,y,tile,42,picked?'#487479':open?'#2d415f':'#182135');
      text(String(i+1),x+tile/2,y+21,21,open?'#f5f1e9':'#67748d');
      if (open && game.dice) cellButton(x,y,tile,42,()=>update(Box.pick(game,i)));
    }
    const target=game.dice ? game.dice[0]+game.dice[1] : 0;
    const picked=Box.total(game.picked);
    if (done(game)) { footer(game,cx,left,w,top+403,''); return; }
    text(game.dice?`已选 ${picked} / 需要 ${target}`:game.notice || '每轮不能盖牌时，记录剩余数字之和',cx,top+396,14,muted);
    if (!game.dice) button('掷骰',left,top+416,w,40,()=>{
      update(Box.roll(game,Array.from({length:2},()=>1+Math.floor(Math.random()*6))));
    },'#395a69');
    else if(picked===target) button('确认盖牌',left,top+416,w,40,()=>update(Box.close(game)),'#395a69');
    else text('点数字牌凑到骰点总和',cx,top+437,14,muted);
    roundControls(false,left,top+470,w);
  }

  function wedge(cx,cy,inner,outer,a,b,fill) {
    ctx.beginPath();
    ctx.arc(cx,cy,outer,a,b);
    ctx.arc(cx,cy,inner,b,a,true);
    ctx.closePath();
    ctx.fillStyle=fill;
    ctx.fill();
  }
  function drawDarts(game,{cx,top,left,w,bottom}) {
    heading(game,cx,top);
    scores(game,left,w,top+81,value=>value+' 分');
    const r=Math.min(w*0.43,(bottom-top-354)/2);
    const cy=top+151+r, turn=Math.min(3,Math.floor(game.turns/(game.scores.length*3))+1);
    text(`第 ${turn}/3 轮 · 每人三镖`,cx,top+139,13,muted);
    const span=Math.PI/10;
    Darts.SECTORS.forEach((score,i)=>{
      const a=i*span-Math.PI/2, begin=a-span/2, end=a+span/2;
      const base=i%2?'#ebd9aa':'#303c43', accent=i%2?'#c94f65':'#398f75';
      wedge(cx,cy,r*0.11,r,begin,end,base);
      wedge(cx,cy,r*0.54,r*0.63,begin,end,accent);
      wedge(cx,cy,r*0.91,r,begin,end,accent);
      text(String(score),cx+Math.cos(a)*r*1.10,cy+Math.sin(a)*r*1.10,Math.min(14,r*0.13), '#f5f1e9');
    });
    circle(cx,cy,r*0.11,'#398f75');
    circle(cx,cy,r*0.05,'#df6376');
    game.marks.filter(mark=>Math.hypot(mark.x,mark.y)<=1).forEach(mark=>{
      circle(cx+mark.x*r,cy+mark.y*r,4,'#fff7bf');
    });
    const y=cy+r+26;
    if (done(game)) { footer(game,cx,left,w,y,''); return; }
    const landing = pointer => ({
      x:(pointer.x-pointer.startX)/r*1.45, y:1.15+(pointer.y-pointer.startY)/r*1.8,
    });
    if (drag) {
      const target=landing(drag);
      if (Math.hypot(target.x,target.y)<=1.13) {
        const x=cx+target.x*r, dy=cy+target.y*r;
        line(x-7,dy,x+7,dy,'#fff7bf',2);
        line(x,dy-7,x,dy+7,'#fff7bf',2);
      }
    }
    box(left,y,w,52,'#304b66');
    text('从这里向上划出飞镖',cx,y+17,16);
    text(game.lastPoints===null?'松手投掷 · 斜划改变方向':`上一镖 ${game.lastPoints} 分 · 本轮第 ${game.turns%3+1} 镖`,cx,y+37,12,muted);
    input={kind:'darts', x:left,y,w,h:52, release(pointer) {
      if (pointer.startY-pointer.y<9) return;
      const target=landing(pointer);
      update(Darts.throw(game,target.x,target.y));
    }};
    roundControls(false,left,y+62,w);
  }

  function drawArena(game,{cx,top,left,w,bottom}) {
    const { W,H,BALL,MALLET,PADDLE,GOAL }=Arena;
    const hockey=game.kind==='hockey';
    const y=top+108, scale=Math.min(w,(bottom-y-194)/H), x=cx-scale*W/2, end=y+H*scale;
    const ink=hockey?'#a9e5ed':'#b3b8f5', pitch=hockey?'#244d67':'#252e55';
    const score = seat => `${label(seat)}  ${game.scores[seat]}`;
    seatText(score(1),cx,top+31,20,SEAT_INK[1],true);
    text(score(0),cx,end+22,20,SEAT_INK[0]);
    box(x-3,y-3,W*scale+6,H*scale+6,ink);
    box(x,y,W*scale,H*scale,pitch);
    line(x,y+H*scale/2,x+scale,y+H*scale/2,ink,1);
    circle(cx,y+H*scale/2,scale*0.15,ink);
    circle(cx,y+H*scale/2,scale*0.145,pitch);
    if (hockey) [y,end].forEach(gy=>box(cx-GOAL*scale,gy-4,GOAL*scale*2,8,'#0e1930'));
    game.paddles.forEach((pad,seat)=>{
      const px=x+pad.x*scale, py=y+pad.y*scale;
      if (hockey) {
        circle(px,py,MALLET*scale,SEAT_INK[seat]);
        circle(px,py,MALLET*scale*0.52,pitch);
      } else box(px-PADDLE*scale,py-0.013*scale,PADDLE*2*scale,0.026*scale,SEAT_INK[seat]);
    });
    circle(x+game.ball.x*scale,y+game.ball.y*scale,BALL*scale,'#fff7dd');
    let serveButton;
    if (game.phase==='ready') {
      const topSeat=game.turn===1;
      const serve = () => {
        Arena.serve(game);
        animate(Arena.step);
      };
      serveButton={x:cx-w/4,y:topSeat?top+55:end+39,w:w/2,h:32,action:serve};
      seatButton('发球',serveButton.x,serveButton.y,serveButton.w,serveButton.h,topSeat,serve,'#395a69');
      seatText(hockey?'拖动圆拍击球 · 先到 5 分':'横向拖动挡板 · 先到 7 分',cx,topSeat?end+51:top+70,13,muted,!topSeat);
    } else if (done(game)) {
      const result=`${label(game.winner)} 获胜！`;
      seatText(result,cx,top+72,20,SEAT_INK[game.winner],true);
      text(result,cx,end+48,20,SEAT_INK[game.winner]);
      text(saveStatus(),cx,end+71,12,muted);
    } else {
      seatText('拖动你这一侧',cx,top+71,13,muted,true);
      text('拖动你这一侧',cx,end+50,13,muted);
    }
    input={kind:'arena',game,x,y,w:scale,h:H*scale,scale,serveButton};
    roundControls(done(game),left,end+79,w);
  }

  function drawPool(game,{cx,top,left,w,bottom}) {
    heading(game,cx,top);
    const {W,H,R,POCKETS}=Pool;
    const y=top+112, scale=Math.min(w,(bottom-y-160)/H), x=cx-scale*W/2;
    const group=seat=>game.groups[seat]===null?'待分组':game.groups[seat]===0?'全色':'花色';
    text(`1 号 ${group(0)}  ·  2 号 ${group(1)}`,cx,top+88,14,muted);
    box(x-7,y-7,scale+14,H*scale+14,'#735a45');
    box(x,y,scale,H*scale,'#226759');
    POCKETS.forEach(p=>circle(x+p.x*scale,y+p.y*scale,scale*0.051,'#142134'));
    const cue=game.balls.find(ball=>ball.id===0);
    if (drag && cue && game.phase==='ready') {
      const dx=drag.startX-drag.x, dy=drag.startY-drag.y, length=Math.hypot(dx,dy);
      if (length>1) {
        const bx=x+cue.x*scale, by=y+cue.y*scale, d=Math.min(scale*0.46,length*1.4);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x,y,scale,H*scale);
        ctx.clip();
        line(bx,by,bx+dx/length*d,by+dy/length*d,'#eaf6d6',2);
        ctx.restore();
      }
    }
    game.balls.forEach(b=>{
      const bx=x+b.x*scale, by=y+b.y*scale;
      const colour=POOL_INK[b.id<=8?b.id:b.id-8];
      circle(bx,by,R*scale,b.id>=9?'#fff7dc':colour);
      if(b.id>=9) box(bx-R*scale*0.83,by-R*scale*0.35,R*scale*1.66,R*scale*0.7,colour);
      if(b.id) text(String(b.id),bx,by,Math.max(8,R*scale*0.95),b.id===8?'#fff':'#182234');
    });
    input={kind:'pool',game,x,y,w:scale,h:H*scale,scale,release(pointer){
      if(Pool.shoot(game,(pointer.startX-pointer.x)/scale,(pointer.startY-pointer.y)/scale)) animate(Pool.step);
      else render();
    }};
    if(game.phase==='inHand') cellButton(x,y,scale,H*scale,(px,py)=>{
      if(Pool.place(game,(px-x)/scale,(py-y)/scale)) render();
    });
    const hint=game.phase==='inHand'?'犯规 · 点空处摆母球':game.phase==='ready'?`${game.notice} · 向后拖动蓄力`:game.notice;
    footer(game,cx,left,w,y+H*scale+13,hint);
  }

  const drawers={connect:drawConnect,race:drawRace,box:drawBox,darts:drawDarts,pong:drawArena,hockey:drawArena,pool:drawPool};
  const contains = (area,x,y) => x>=area.x && x<area.x+area.w && y>=area.y && y<area.y+area.h;
  function pointer(type,id,x,y) {
    if (!input) return;
    const inside=contains(input,x,y);
    if(input.kind==='arena') {
      if (type==='down' && input.serveButton && contains(input.serveButton,x,y)) {
        input.serveButton.action();
        return;
      }
      if(type==='down'&&inside&&!done(input.game)) {
        const seat=y<input.y+input.h/2 ? 1 : 0;
        if (![...pointers.values()].includes(seat)) pointers.set(id,seat);
      }
      const seat=pointers.get(id);
      if(seat===undefined) return;
      if(type==='up'||type==='cancel') pointers.delete(id);
      else {
        Arena.readyAim(input.game,seat,(x-input.x)/input.scale,(y-input.y)/input.scale);
        if(input.game.phase==='ready') render();
      }
      return;
    }
    if(type==='down'&&inside&&!drag&&(input.kind!=='pool'||input.game.phase==='ready')) drag={id,startX:x,startY:y,x,y};
    if(drag?.id!==id) return;
    Object.assign(drag,{x,y});
    if(type==='move') render();
    if(type==='up'||type==='cancel') {
      const pointer=drag;
      drag=null;
      if(type==='up') input.release(pointer);
      render();
    }
  }
  return {
    reset,pointer,
    draw(id,game,layout) { input=null; drawers[id](game,layout); },
  };
}

module.exports = { createExtraUI };
