'use strict';
const { createGame, play } = require('./game');
const Records = require('./records');
function start(platform) {
  const { canvas, storage } = platform;
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let width, height, scene = 'home', game, records = Records.load(storage), first = 'X', saved = true, buttons = [], locked = false;
  const colors = { bg: '#11152a', panel: '#202640', ink: '#f5f1e9', muted: '#aab2cc', X: '#ffad98', O: '#80dfd4' };
  function text(value, x, y, size = 18, color = colors.ink) { ctx.fillStyle = color; ctx.font = `${size >= 25 ? 'bold ' : ''}${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y); }
  function box(x,y,w,h,color) { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); }
  function button(label,x,y,w,h,action,color = colors.panel) { box(x,y,w,h,color); text(label,x+w/2,y+h/2,17); buttons.push({x,y,w,h,action}); }
  function newRound() { game = createGame(first); scene = 'game'; locked = false; render(); }
  function render() {
    buttons = []; box(0,0,width,height,colors.bg);
    const cx = width/2, top = Math.max(30, platform.safeTop || 0), w = Math.min(width-40,400), left = cx-w/2;
    text('DUO / 一起玩',cx,top+15,15,colors.O);
    if (scene === 'home') {
      text('双人互动小游戏大全',cx,top+76,26);
      text('一块屏幕，两个人，一点胜负欲。',cx,top+115,15,colors.muted);
      box(left,top+155,w,190,colors.panel);
      text('✕  /  ○',cx,top+201,40,colors.X);
      text('井字棋',cx,top+251,27); text('同屏对战 · 轮流落子 · 约 1 分钟',cx,top+289,15,colors.muted);
      button('开始双人对战',left,top+365,w,54,newRound,'#395a69');
      button('本机最佳战绩',left,top+434,w,50,()=>{scene='records';render();});
      text('更多游戏与好友联机，后续开放',cx,top+519,14,colors.muted);
      text('无需登录 · 战绩仅保存在此设备',cx,Math.min(height-25,top+555),13,colors.muted);
    } else if (scene === 'records') {
      text('本机战绩',cx,top+75,29);
      text(`完成 ${records.rounds} 局 · 平局 ${records.draws} 局`,cx,top+124,17,colors.muted);
      ['X','O'].forEach((p,i)=>{ const y=top+175+i*120; box(left,y,w,100,colors.panel); text(`玩家 ${p} · ${records[p].wins} 胜`,cx,y+30,23,colors[p]); text(`最快获胜：${records[p].bestMoves === null ? '暂无' : records[p].bestMoves+' 次落子'}`,cx,y+69,16,colors.muted); });
      text('玩家 X / O 代表座位，不代表微信身份。',cx,top+437,13,colors.muted);
      button('返回大厅',left,top+470,w,50,()=>{scene='home';render();});
    } else {
      const done = game.winner || game.draw;
      text(done ? (game.draw ? '默契平局！' : `玩家 ${game.winner} 获胜！`) : `轮到玩家 ${game.turn}`,cx,top+68,28,game.winner ? colors[game.winner] : colors.ink);
      text('先连成横、竖或斜向三子即获胜',cx,top+106,14,colors.muted);
      const size = Math.min(w, height-top-330), cell = size/3, bx = cx-size/2, by = top+140;
      for(let i=0;i<9;i++) {
        const x=bx+(i%3)*cell,y=by+Math.floor(i/3)*cell;
        box(x+3,y+3,cell-6,cell-6,game.line.includes(i)?'#3d5064':colors.panel);
        if(game.board[i]) text(game.board[i] === 'X' ? '✕' : '○',x+cell/2,y+cell/2,cell*0.55,colors[game.board[i]]);
        buttons.push({x,y,w:cell,h:cell,action:()=>{
          if(locked) return;
          const next = play(game,i); if(next === game) return; game=next;
          if(game.winner || game.draw) { locked=true; records=Records.record(records,game); saved=Records.save(storage,records); }
          render();
        }});
      }
      const y=by+size+20;
      text(done ? (saved ? '战绩已保存在本机' : '保存失败，本次战绩仅在当前会话有效') : `玩家 X（暖橙） vs 玩家 O（薄荷）`,cx,y,13,colors.muted);
      button(done?'再来一局 · 交换先手':'重新开局（不计战绩）',left,y+28,w,48,()=>{const go=()=>{first=first==='X'?'O':'X';newRound();};if(done)go();else platform.confirm('重新开局？未完成的对局不计入战绩。',go);});
      button('返回大厅',left,y+89,w,46,()=>{const go=()=>{scene='home';render();};if(done)go();else platform.confirm('离开本局？未完成的对局不计入战绩。',go);});
    }
  }
  function resize() { const info=platform.size(); scale=Math.min(1,info.height/650);width=info.width/scale; height=info.height/scale; const dpr=info.dpr||1; canvas.width=Math.round(info.width*dpr);canvas.height=Math.round(info.height*dpr);ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);render(); }
  platform.onTap((x,y)=>{x/=scale;y/=scale;const hit=buttons.find(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h);if(hit)hit.action();});
  platform.onResize(resize); resize();
}
module.exports = { start };
