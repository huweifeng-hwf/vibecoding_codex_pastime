'use strict';
const { createGame, play } = require('./game');
const Gomoku = require('./gomoku');
const Records = require('./records');
function start(platform) {
  const { canvas, storage } = platform;
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let width, height, safeBottom = 0, scene = 'home', game, saved = true, buttons = [];
  let records = Records.load(storage);
  let gomokuRecords = Records.loadGomoku(storage);
  let first = 'X', gomokuFirst = 'black';
  let playingGomoku = false, showingGomokuRecords = false;
  const colors = { bg: '#11152a', panel: '#202640', ink: '#f5f1e9', muted: '#aab2cc', X: '#ffad98', O: '#80dfd4' };
  function text(value, x, y, size = 18, color = colors.ink) { ctx.fillStyle = color; ctx.font = `${size >= 25 ? 'bold ' : ''}${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y); }
  function box(x,y,w,h,color) { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); }
  function button(label,x,y,w,h,action,color = colors.panel) { box(x,y,w,h,color); text(label,x+w/2,y+h/2,17); buttons.push({x,y,w,h,action}); }
  const playerNames = { black: '黑方', white: '白方' };
  function newRound() {
    game = playingGomoku ? Gomoku.createGame(gomokuFirst) : createGame(first);
    scene = 'game';
    render();
  }

  function openGame(gomoku) {
    playingGomoku = gomoku;
    newRound();
  }

  function commitMove(index) {
    const next = playingGomoku ? Gomoku.play(game, index) : play(game, index);
    if (next === game) return;
    game = next;
    if (game.winner || game.draw) {
      if (playingGomoku) {
        gomokuRecords = Records.recordGomoku(gomokuRecords, game);
        saved = Records.save(storage, gomokuRecords, Records.GOMOKU_KEY);
      } else {
        records = Records.record(records, game);
        saved = Records.save(storage, records);
      }
    }
    render();
  }

  function roundControls(done, left, y, w) {
    const restart = () => {
      if (playingGomoku) {
        if (done) gomokuFirst = Gomoku.other(gomokuFirst);
      } else {
        first = first === 'X' ? 'O' : 'X';
      }
      newRound();
    };
    button(done ? '再来一局 · 交换先手' : '重新开局（不计战绩）', left,y,w,48,() => {
      if (done) restart();
      else platform.confirm('重新开局？未完成的对局不计入战绩。', restart);
    });
    button('返回大厅',left,y+61,w,46,() => {
      const go = () => { scene = 'home'; render(); };
      if (done) go();
      else platform.confirm('离开本局？未完成的对局不计入战绩。', go);
    });
  }

  function saveStatus() {
    return saved ? '战绩已保存在本机' : '保存失败，本次战绩仅在当前会话有效';
  }

  function gameCard(title, description, left, y, w, action) {
    box(left,y,w,114,colors.panel);
    text(title,left+w/2,y+27,24);
    text(description,left+w/2,y+57,15,colors.muted);
    button('开始对战',left,y+74,w,40,action,'#395a69');
  }

  function drawGomoku(cx, top, left, w) {
    const { SIZE } = Gomoku;
    const done = game.winner || game.draw;
    text(game.draw ? '默契平局！' : game.winner ? playerNames[game.winner]+'获胜！' :
      playerNames[game.turn]+'落子',cx,top+58,28);
    text('横、竖或斜向连成五子及以上获胜',cx,top+89,14,colors.muted);

    const by = top+110;
    const size = Math.min(w, height-safeBottom-by-165);
    const bx = cx-size/2;
    const step = size/SIZE;
    const inset = step/2;
    const grid = size-step;
    box(bx,by,size,size,'#d5a66d');
    for (let i=0; i<SIZE; i++) {
      const offset = inset+i*step;
      box(bx+offset,by+inset,1,grid,'#694a32');
      box(bx+inset,by+offset,grid,1,'#694a32');
    }

    for (let i=0; i<game.board.length; i++) {
      const x = bx+(i%SIZE)*step;
      const y = by+Math.floor(i/SIZE)*step;
      const stone = game.board[i];
      if (stone) {
        const color = stone === 'black' ? '#1f2026' : '#fff5de';
        ctx.beginPath();
        ctx.arc(x+inset,y+inset,step*0.41,0,Math.PI*2);
        ctx.fillStyle = color;
        ctx.fill();
        if (game.line.includes(i) || i === game.last) {
          const mark = game.line.includes(i) ? '#ef7963' : '#589fcb';
          box(x+inset-2,y+inset-2,4,4,mark);
        }
      }
    }

    if (!done) {
      buttons.push({x:bx,y:by,w:size,h:size,action:(x,y) => {
        const index = Math.floor((y-by)/step)*SIZE + Math.floor((x-bx)/step);
        commitMove(index);
      }});
    }

    const y = by+size+12;
    text(done ? saveStatus() : '轻点空交叉点落子',cx,y+14,13,colors.muted);
    roundControls(done,left,y+33,w);
  }
  function render() {
    buttons = []; box(0,0,width,height,colors.bg);
    const cx = width/2, top = Math.max(30, platform.safeTop || 0), w = Math.min(width-40,400), left = cx-w/2;
    text('DUO / 一起玩',cx,top+15,15,colors.O);
    if (scene === 'home') {
      text('双人互动小游戏大全',cx,top+76,26);
      text('一块屏幕，两个人，一点胜负欲。',cx,top+115,15,colors.muted);
      gameCard('井字棋','双人同屏 · 约 1 分钟',left,top+150,w,() => openGame(false));
      gameCard('五子棋','双人同屏 · 轮流落子',left,top+285,w,() => openGame(true));
      button('本机战绩',left,top+434,w,50,()=>{scene='records';render();});
      text('无需登录 · 战绩仅保存在此设备',cx,top+519,13,colors.muted);
    } else if (scene === 'records') {
      text('本机战绩',cx,top+69,29);
      const tabWidth = (w-10)/2;
      button('井字棋',left,top+105,tabWidth,42,() => {showingGomokuRecords=false;render();},
        showingGomokuRecords ? colors.panel : '#395a69');
      button('五子棋',left+tabWidth+10,top+105,tabWidth,42,() => {showingGomokuRecords=true;render();},
        showingGomokuRecords ? '#395a69' : colors.panel);
      const stats = showingGomokuRecords ? gomokuRecords : records;
      text(`完成 ${stats.rounds} 局 · 平局 ${stats.draws} 局`,cx,top+175,17,colors.muted);
      if (showingGomokuRecords) {
        ['black','white'].forEach((player,i) => {
          const y = top+210+i*95;
          box(left,y,w,75,colors.panel);
          text(`${playerNames[player]} · ${stats[player]} 胜`,cx,y+38,23);
        });
      } else {
        ['X','O'].forEach((p,i)=>{ const y=top+210+i*100; box(left,y,w,90,colors.panel); text(`玩家 ${p} · ${stats[p].wins} 胜`,cx,y+27,23,colors[p]); text(`最快获胜：${stats[p].bestMoves === null ? '暂无' : stats[p].bestMoves+' 次落子'}`,cx,y+63,16,colors.muted); });
      }
      text('胜场按本机座位记录',cx,top+437,13,colors.muted);
      button('返回大厅',left,top+470,w,50,()=>{scene='home';render();});
    } else if (playingGomoku) {
      drawGomoku(cx,top,left,w);
    } else {
      const done = game.winner || game.draw;
      text(done ? (game.draw ? '默契平局！' : `玩家 ${game.winner} 获胜！`) : `轮到玩家 ${game.turn}`,cx,top+68,28,game.winner ? colors[game.winner] : colors.ink);
      text('先连成横、竖或斜向三子即获胜',cx,top+106,14,colors.muted);
      const size = Math.min(w, height-top-330), cell = size/3, bx = cx-size/2, by = top+140;
      for(let i=0;i<9;i++) {
        const x=bx+(i%3)*cell,y=by+Math.floor(i/3)*cell;
        box(x+3,y+3,cell-6,cell-6,game.line.includes(i)?'#3d5064':colors.panel);
        if(game.board[i]) text(game.board[i] === 'X' ? '✕' : '○',x+cell/2,y+cell/2,cell*0.55,colors[game.board[i]]);
        buttons.push({x,y,w:cell,h:cell,action:()=>commitMove(i)});
      }
      const y=by+size+20;
      text(done ? saveStatus() : '玩家 X（暖橙） vs 玩家 O（薄荷）',cx,y,13,colors.muted);
      roundControls(done,left,y+28,w);
    }
  }
  function resize() { const info=platform.size(); scale=Math.min(1,info.height/650);width=info.width/scale; height=info.height/scale; safeBottom=(info.safeBottom || 0)/scale; const dpr=info.dpr||1; canvas.width=Math.round(info.width*dpr);canvas.height=Math.round(info.height*dpr);ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);render(); }
  platform.onTap((x,y)=>{x/=scale;y/=scale;const hit=buttons.find(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h);if(hit)hit.action(x,y);});
  platform.onResize(resize); resize();
}
module.exports = { start };
