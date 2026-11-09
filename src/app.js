'use strict';
const { createGame, play } = require('./game');
const Gomoku = require('./gomoku');
const Memory = require('./memory');
const Flight = require('./flight');
const Records = require('./records');
const { createOnline } = require('./online');

const GAMES = [
  { id: 'ticTacToe', title: '井字棋', description: '2 人 · 连成三子' },
  { id: 'gomoku', title: '五子棋', description: '2 人 · 自由连五' },
  { id: 'memory', title: '翻牌配对', description: '2–4 人 · 记忆对战', start: '开始配对', rules: Memory },
  { id: 'flight', title: '飞行棋', description: '2–4 人 · 双机快局', start: '开始飞行', rules: Flight },
];
const PLAYER_COUNTS = [2, 3, 4];
const SEAT_COLORS = ['#ffad98', '#80dfd4', '#ffd67d', '#c4b5ff'];
const playerLabel = seat => `玩家 ${seat + 1}`;
const isMemoryDone = game => game.winner !== null || game.draw;
function start(platform) {
  const { canvas, storage } = platform;
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let width, height, safeBottom = 0, scene = 'home', game, saved = true, buttons = [];
  let records = Records.load(storage);
  let gomokuRecords = Records.loadGomoku(storage);
  let first = 'X', gomokuFirst = 'black';
  let activeGame = GAMES[0].id, recordsGame = GAMES[0].id, playerCount = 2, recordsCount = 2;
  const multiplayerRecords = new Map(GAMES.filter(game => game.rules).map(({ id }) => [
    id, new Map(PLAYER_COUNTS.map(count => [count, Records.loadMultiplayer(storage, id, count)])),
  ]));
  const online = platform.roomCall ? createOnline(platform.roomCall, storage, render) : null;
  let roomInput = '';
  if (online) platform.onVisibility(value => online.visibility(value));
  const colors = { bg: '#11152a', panel: '#202640', ink: '#f5f1e9', muted: '#aab2cc', X: '#ffad98', O: '#80dfd4' };
  function text(value, x, y, size = 18, color = colors.ink) { ctx.fillStyle = color; ctx.font = `${size >= 25 ? 'bold ' : ''}${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y); }
  function box(x,y,w,h,color) { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); }
  function button(label,x,y,w,h,action,color = colors.panel) { box(x,y,w,h,color); text(label,x+w/2,y+h/2,17); buttons.push({x,y,w,h,action}); }
  const playerNames = { black: '黑方', white: '白方' };
  function newRound() {
    game = activeGame === 'gomoku' ? Gomoku.createGame(gomokuFirst) : createGame(first);
    scene = 'game';
    render();
  }

  function openGame(id) {
    activeGame = id;
    if (multiplayerRecords.has(id)) {
      playerCount = 2;
      scene = 'setup';
      render();
      return;
    }
    newRound();
  }

  function startMultiplayer(firstSeat) {
    const { rules } = GAMES.find(({ id }) => id === activeGame);
    game = rules.createGame(playerCount, firstSeat);
    scene = 'game';
    render();
  }

  function saveMultiplayer() {
    const recordsByCount = multiplayerRecords.get(activeGame);
    const stats = Records.recordMultiplayer(recordsByCount.get(playerCount), game);
    recordsByCount.set(playerCount, stats);
    saved = Records.save(storage, stats, Records.multiplayerKey(activeGame, playerCount));
  }

  function playFlight(next) {
    if (next === game) return;
    game = next;
    if (game.winner !== null) saveMultiplayer();
    render();
  }

  function flipCard(index) {
    const next = Memory.flip(game, index);
    if (next === game) return;
    game = next;
    if (isMemoryDone(game)) {
      saveMultiplayer();
    } else if (game.open.length === 2) {
      setTimeout(() => {
        if (scene !== 'game' || game !== next) return;
        game = Memory.hideMismatch(next);
        render();
      }, 850);
    }
    render();
  }

  function commitMove(index) {
    const next = activeGame === 'gomoku' ? Gomoku.play(game, index) : play(game, index);
    if (next === game) return;
    game = next;
    if (game.winner || game.draw) {
      if (activeGame === 'gomoku') {
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
      if (multiplayerRecords.has(activeGame)) {
        startMultiplayer(done ? (game.first + 1) % playerCount : game.first);
        return;
      }
      if (activeGame === 'gomoku') {
        if (done) gomokuFirst = Gomoku.other(gomokuFirst);
      } else {
        first = first === 'X' ? 'O' : 'X';
      }
      newRound();
    };
    const rematch = multiplayerRecords.has(activeGame) ? '再来一局 · 轮换先手' : '再来一局 · 交换先手';
    button(done ? rematch : '重新开局（不计战绩）', left,y,w,48,() => {
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

  function drawGameCards(left, top, w) {
    const cardWidth = (w-12)/2;
    GAMES.forEach(({ id, title, description }, i) => {
      const x = left+(i%2)*(cardWidth+12);
      const y = top+150+Math.floor(i/2)*110;
      box(x,y,cardWidth,96,colors.panel);
      text(title,x+cardWidth/2,y+32,22);
      text(description,x+cardWidth/2,y+63,13,colors.muted);
      buttons.push({x,y,w:cardWidth,h:96,action:() => openGame(id)});
    });
  }

  function countButtons(left, y, w, selected, select) {
    const tabWidth = (w-16)/3;
    PLAYER_COUNTS.forEach((count,i) => {
      button(`${count} 人`,left+i*(tabWidth+8),y,tabWidth,44,() => select(count),
        count === selected ? '#395a69' : colors.panel);
    });
  }

  function drawMemory(cx, top, left, w) {
    const done = isMemoryDone(game);
    const title = game.draw ? '配对数并列 · 平局' :
      done ? `${playerLabel(game.winner)}获胜！` : `轮到${playerLabel(game.turn)}`;
    text(title,cx,top+58,26);
    const scoreWidth = w/playerCount;
    game.scores.forEach((score,seat) => {
      text(`${seat+1} 号 · ${score} 对`,left+(seat+0.5)*scoreWidth,top+92,14,SEAT_COLORS[seat]);
    });

    const by = top+113;
    const size = Math.min(w,height-safeBottom-by-165);
    const bx = cx-size/2;
    const cell = size/Memory.GRID_SIZE;
    game.cards.forEach((symbol,i) => {
      const x = bx+(i%Memory.GRID_SIZE)*cell;
      const y = by+Math.floor(i/Memory.GRID_SIZE)*cell;
      const owner = game.owners[i];
      const matched = owner !== null;
      const open = game.open.includes(i);
      box(x+3,y+3,cell-6,cell-6,matched ? SEAT_COLORS[owner] : open ? '#f5f1e9' : colors.panel);
      text(matched || open ? symbol : '?',x+cell/2,y+cell*(matched ? 0.40 : 0.50),
        cell*0.43,matched || open ? colors.bg : colors.muted);
      if (matched) text(`${owner+1} 号`,x+cell/2,y+cell*0.76,12,colors.bg);
      if (!done && !matched && !open && game.open.length < 2) {
        buttons.push({x,y,w:cell,h:cell,action:() => flipCard(i)});
      }
    });
    const y = by+size+12;
    const hint = game.open.length === 2 ? '未配对，即将换人' : '每次翻两张，配对成功可继续';
    text(done ? saveStatus() : hint,cx,y+14,13,colors.muted);
    roundControls(done,left,y+33,w);
  }

  function drawFlight(cx, top, left, w) {
    const done = game.winner !== null;
    text(done ? `${playerLabel(game.winner)}获胜！` : `轮到${playerLabel(game.turn)}`,cx,top+58,26);
    game.planes.forEach((pair,seat) => {
      const arrived = pair.filter(progress => progress === Flight.FINISH).length;
      text(`${seat+1} 号 · ${arrived}/2`,left+(seat+0.5)*w/playerCount,top+92,14,SEAT_COLORS[seat]);
    });

    const by = top+113;
    const size = Math.min(w,height-safeBottom-by-212);
    const bx = cx-size/2;
    const cell = size/Flight.GRID_SIZE;
    const square = ([col,row], color, label = '', ink = colors.ink) => {
      box(bx+col*cell+1,by+row*cell+1,cell-2,cell-2,color);
      if (label) text(label,bx+(col+0.5)*cell,by+(row+0.5)*cell,cell*0.45,ink);
    };
    for (let i=0; i<Flight.LAP; i++) square(Flight.trackPoint(i),colors.panel);
    ['→','↓','←','↑'].forEach((arrow,quarter) => {
      square(Flight.trackPoint(quarter*6),colors.panel,arrow,colors.muted);
    });
    square([3,3],'#395a69','终');
    game.quarters.forEach((quarter,seat) => {
      const color = SEAT_COLORS[seat];
      square(Flight.planePoint(quarter,0,0),color,`${seat+1}`,colors.bg);
      for (let progress=Flight.LAP; progress<Flight.FINISH; progress++) {
        square(Flight.planePoint(quarter,0,progress),'#395a69',`${seat+1}`);
      }
      for (let plane=0; plane<2; plane++) square(Flight.planePoint(quarter,plane,Flight.HANGAR),colors.panel);
    });
    game.planes.forEach((pair,seat) => {
      pair.forEach((progress,plane) => {
        if (progress === Flight.FINISH) return;
        const [col,row] = Flight.planePoint(game.quarters[seat],plane,progress);
        const x = bx+col*cell, y = by+row*cell;
        const selectable = seat === game.turn && Flight.canMove(game,plane);
        box(x+cell*0.12,y+cell*0.12,cell*0.76,cell*0.76,selectable ? colors.ink : SEAT_COLORS[seat]);
        text(`${seat+1}${plane === 0 ? 'A' : 'B'}`,x+cell/2,y+cell/2,cell*0.37,colors.bg);
        if (selectable) buttons.push({x,y,w:cell,h:cell,action:() => playFlight(Flight.move(game,plane))});
      });
    });

    const y = by+size+10;
    const hint = game.die !== null ? `掷出 ${game.die} · 选择飞机` :
      game.lastRoll === null ? '掷到 6 可起飞，终点需要刚好到达' :
      `骰子 ${game.lastRoll}${game.notice ? ' · '+game.notice : ''}`;
    text(done ? saveStatus() : hint,cx,y+14,13,colors.muted);
    if (!done && game.die === null) {
      button('掷骰子',left,y+29,w,44,() => playFlight(Flight.roll(game,1+Math.floor(Math.random()*6))),'#395a69');
    } else if (!done) {
      const half = (w-10)/2;
      ['A','B'].forEach((label,plane) => {
        const x = left+plane*(half+10);
        if (Flight.canMove(game,plane)) {
          button(`移动飞机 ${label}`,x,y+29,half,44,() => playFlight(Flight.move(game,plane)),'#395a69');
        } else {
          box(x,y+29,half,44,colors.panel);
          text(`飞机 ${label} 不可走`,x+half/2,y+51,14,colors.muted);
        }
      });
    }
    roundControls(done,left,done ? y+33 : y+84,w);
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
  function drawTicBoard(board, cx, y, size, onMove) {
    const cell = size/3;
    const bx = cx-size/2;
    for (let i=0; i<9; i++) {
      const x = bx+(i%3)*cell, row = y+Math.floor(i/3)*cell;
      box(x+3,row+3,cell-6,cell-6,board.line.includes(i) ? '#3d5064' : colors.panel);
      const piece = board.board[i];
      if (piece) text(piece === 'X' ? '✕' : '○',x+cell/2,row+cell/2,cell*0.55,colors[piece]);
      if (onMove && !piece) buttons.push({x,y:row,w:cell,h:cell,action:() => onMove(i)});
    }
  }

  function returnFromOnline() {
    online.close();
    scene = 'home';
    render();
  }

  function drawOnline(cx, top, left, w) {
    const { room, code, busy, retry, message } = online.state();
    text('井字棋 · 好友房',cx,top+58,26);
    if (scene === 'roomCode') {
      text(roomInput || '输入 10 位房间码',cx,top+105,21);
      const keyWidth = (w-24)/4;
      [...'0123456789ABCDEF'].forEach((key,i) => {
        button(key,left+(i%4)*(keyWidth+8),top+131+Math.floor(i/4)*49,keyWidth,42,() => {
          if (roomInput.length < 10) roomInput += key;
          render();
        });
      });
      button('删除',left,top+331,keyWidth*2+8,44,() => { roomInput = roomInput.slice(0,-1); render(); });
      button('加入房间',left+keyWidth*2+16,top+331,keyWidth*2+8,44,() => {
        if (roomInput.length !== 10) return;
        scene = 'online';
        online.action('join', { code: roomInput });
      },roomInput.length === 10 ? '#395a69' : colors.panel);
      button('返回',left,top+389,w,44,() => { scene = 'online'; render(); });
      return;
    }

    if (!room) {
      text(message || (busy ? '正在连接…' : '创建房间或输入朋友的房间码'),cx,top+106,14,colors.muted);
      if (retry) {
        button('重试上次操作',left,top+142,w,46,() => online.action('retry'),'#395a69');
        button('返回大厅',left,top+200,w,46,returnFromOnline);
      } else if (!busy) {
        button('创建房间',left,top+142,w,46,() => online.action('create'),'#395a69');
        button('输入房间码',left,top+200,w,46,() => { roomInput = ''; scene = 'roomCode'; render(); });
        if (code) button('恢复房间',left,top+258,w,46,() => online.open());
        button('检查云连接',left,top+316,w,46,() => online.action('probe'));
        button('返回大厅',left,top+374,w,46,returnFromOnline);
      }
      return;
    }

    text(`房间码 ${room.code} · 你是 ${room.seat}`,cx,top+96,17);
    const closed = room.status === 'closed' || room.status === 'interrupted';
    const ready = room.seats[room.seat === 'X' ? 0 : 1].ready;
    if (room.status === 'waiting') {
      ['X','O'].forEach((seat,i) => {
        const member = room.seats[i];
        const state = !member ? '等待加入' : !member.online ? '暂离' : member.ready ? '已准备' : '未准备';
        text(`${seat} · ${state}`,cx,top+145+i*42,20,colors[seat]);
      });
      const canStart = room.seat === 'X' && room.seats.length === 2 &&
        room.seats.every(member => member.ready && member.online);
      text(message || '把房间码告诉朋友',cx,top+234,14,colors.muted);
      if (canStart && !busy) button('开始对局',left,top+260,w,48,() => online.action('start'),'#395a69');
      else if (!ready && !busy) button('准备',left,top+260,w,48,() => online.action('ready'),'#395a69');
      else text(busy ? '同步中…' : '等待两位玩家准备',cx,top+284,16,colors.muted);
      if (!busy) button('离开房间',left,top+322,w,46,() => online.action('leave'));
      return;
    }

    const playing = room.status === 'playing';
    const other = room.seats[room.seat === 'X' ? 1 : 0];
    const title = closed ? (room.status === 'closed' ? '房间已关闭' : '对局已中断') :
      playing ? (room.game.turn === room.seat ? '轮到你落子' : '等待对手落子') :
      room.game.draw ? '平局' : `${room.game.winner} 方获胜！`;
    text(title,cx,top+131,23);
    const by = top+155;
    const size = Math.min(w,height-safeBottom-by-155);
    const canPlay = playing && room.game.turn === room.seat && !busy && other.online;
    if (room.game) drawTicBoard(room.game,cx,by,size,canPlay ? index => online.action('move',{ index }) : null);
    const y = room.game ? by+size+10 : by+15;
    const hint = closed ? '返回大厅后可创建新房间' :
      !other.online ? '对手暂离，等待重连' :
      playing ? '好友房结果独立于本机战绩' : ready ? '已准备，等待对手' : '双方准备后交换先手';
    text(message || (busy ? '同步中…' : hint),cx,y+12,14,colors.muted);
    if (room.status === 'finished' && !ready && !busy) {
      button('准备再战',left,y+32,w,44,() => online.action('rematch'),'#395a69');
    }
    if (!busy) {
      button(room.status === 'closed' ? '返回大厅' : '离开房间',left,y+86,w,44,() => {
        if (room.status === 'closed') returnFromOnline();
        else if (playing) platform.confirm('离开将中断本局，确定离开？',() => online.action('leave'));
        else online.action('leave');
      });
    }
  }

  function render() {
    buttons = []; box(0,0,width,height,colors.bg);
    const cx = width/2, top = Math.max(30, platform.safeTop || 0), w = Math.min(width-40,400), left = cx-w/2;
    text('DUO / 一起玩',cx,top+15,15,colors.O);
    if (scene === 'home') {
      text('双人互动小游戏大全',cx,top+76,26);
      text('一块屏幕，轮流玩，一点胜负欲。',cx,top+115,15,colors.muted);
      drawGameCards(left,top,w);
      if (online) button('井字棋 · 好友联机',left,top+369,w,49,() => {
        scene = 'online';
        online.open();
        render();
      },'#395a69');
      button('本机战绩',left,top+434,w,50,()=>{scene='records';render();});
      text('无需登录 · 战绩仅保存在此设备',cx,top+519,13,colors.muted);
    } else if (scene === 'online' || scene === 'roomCode') {
      drawOnline(cx,top,left,w);
    } else if (scene === 'setup') {
      const { title, start } = GAMES.find(({ id }) => id === activeGame);
      text(title,cx,top+76,29);
      text('选择同屏玩家人数',cx,top+123,17,colors.muted);
      countButtons(left,top+150,w,playerCount,count => { playerCount = count; render(); });
      button(start,left,top+218,w,48,() => startMultiplayer(0),'#395a69');
      button('返回大厅',left,top+280,w,46,() => { scene = 'home'; render(); });
    } else if (scene === 'records') {
      text('本机战绩',cx,top+69,29);
      const tabWidth = (w-16)/GAMES.length;
      GAMES.forEach(({ id, title },i) => {
        button(title,left+i*(tabWidth+8),top+105,tabWidth,42,() => { recordsGame = id; render(); },
          recordsGame === id ? '#395a69' : colors.panel);
      });
      const recordsByCount = multiplayerRecords.get(recordsGame);
      const stats = recordsByCount ? recordsByCount.get(recordsCount) :
        recordsGame === 'gomoku' ? gomokuRecords : records;
      const statsY = recordsByCount ? top+219 : top+175;
      const summary = `完成 ${stats.rounds} 局`;
      text(recordsGame === 'flight' ? summary : `${summary} · 平局 ${stats.draws} 局`,cx,statsY,17,colors.muted);
      if (recordsByCount) {
        countButtons(left,top+156,w,recordsCount,count => { recordsCount = count; render(); });
        stats.wins.forEach((wins,seat) => {
          const y = top+242+seat*43;
          box(left,y,w,37,colors.panel);
          text(`${playerLabel(seat)} · ${wins} 胜`,cx,y+18,17,SEAT_COLORS[seat]);
        });
      } else if (recordsGame === 'gomoku') {
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
    } else if (activeGame === 'flight') {
      drawFlight(cx,top,left,w);
    } else if (activeGame === 'memory') {
      drawMemory(cx,top,left,w);
    } else if (activeGame === 'gomoku') {
      drawGomoku(cx,top,left,w);
    } else {
      const done = game.winner || game.draw;
      text(done ? (game.draw ? '默契平局！' : `玩家 ${game.winner} 获胜！`) : `轮到玩家 ${game.turn}`,cx,top+68,28,game.winner ? colors[game.winner] : colors.ink);
      text('先连成横、竖或斜向三子即获胜',cx,top+106,14,colors.muted);
      const size = Math.min(w, height-top-330), by = top+140;
      drawTicBoard(game,cx,by,size,done ? null : commitMove);
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
