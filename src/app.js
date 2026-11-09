'use strict';
const { createGame, play } = require('./game');
const Gomoku = require('./gomoku');
const Memory = require('./memory');
const Flight = require('./flight');
const Records = require('./records');
const { createOnline } = require('./online');
const EXTRA_GAMES = require('./extra-games');
const { createExtraUI } = require('./extra-ui');

const GAMES = [
  { id: 'ticTacToe', title: '井字棋', description: '2 人 · 连成三子' },
  { id: 'gomoku', title: '五子棋', description: '2 人 · 自由连五' },
  { id: 'memory', title: '翻牌配对', description: '2–4 人 · 记忆对战', start: '开始配对', rules: Memory },
  { id: 'flight', title: '飞行棋', description: '2–4 人 · 双机快局', start: '开始飞行', rules: Flight },
  ...EXTRA_GAMES,
];
const EXTRA_IDS = new Set(EXTRA_GAMES.map(({id}) => id));
const variableCount = id => id === 'flight' || id === 'memory' || EXTRA_GAMES.some(game => game.id === id && game.variable);
const PLAYER_COUNTS = [2, 3, 4];
const RECORD_TABS = [['seats','座位统计'],['history','逐局历史'],['friends','好友交手榜'],['profiles','玩家档案']];
const SEATING_KEY = 'duo.seating.v1';
const SEAT_COLORS = ['#ffad98', '#80dfd4', '#ffd67d', '#c4b5ff'];
const FLIGHT_COLORS = ['#ff967e', '#84dbb3', '#ffcf77', '#93baff'];
const FLIGHT_TILES = {
  supply: { symbol: '+', fill: '#214e46', ink: '#99f1bb' },
  turbulence: { symbol: '−2', fill: '#593746', ink: '#ffb7b6' },
};
const playerLabel = seat => `玩家 ${seat + 1}`;
const isMemoryDone = game => game.winner !== null || game.draw;
function start(platform) {
  const { canvas, storage } = platform;
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let width, height, safeBottom = 0, scene = 'home', game, saved = true, buttons = [];
  let records = Records.load(storage);
  let gomokuRecords = Records.loadGomoku(storage);
  let journal = Records.loadJournal(storage);
  let roundPlayers = [null,null], roundFirst = 0, draftPlayers = [];
  let recordsTab = 'seats', page = 0, selectedMatch, profilePicker, profileMessage = '', rosterBack;
  let finishedMatch, profileDetail, showArchived = false, historyProfile = null, starterProfile = null;
  const friends = [null,null];
  let activeGame = GAMES[0].id, recordsGame = GAMES[0].id, playerCount = 2, recordsCount = 2;
  let gamePage = 0;
  const multiplayerRecords = new Map(GAMES.filter(game => game.rules).map(({ id }) => [
    id, new Map((variableCount(id) ? PLAYER_COUNTS : [2]).map(count => [count, Records.loadMultiplayer(storage, id, count)])),
  ]));
  journal.matches.forEach(updateSeatStats);
  const online = platform.roomCall ? createOnline(platform.roomCall, storage, render) : null;
  let roomInput = '';
  let facing = false, seatPrompt = null, rollingFlight = null, movingFlight = null;
  try { facing = storage.get(SEATING_KEY) === 'facing'; } catch {}
  function toggleSeating() {
    facing = !facing;
    try { storage.set(SEATING_KEY, facing ? 'facing' : 'side'); } catch {}
    render();
  }
  if (online) platform.onVisibility(value => online.visibility(value));
  const colors = { bg: '#11152a', panel: '#202640', ink: '#f5f1e9', muted: '#aab2cc', X: '#ffad98', O: '#80dfd4' };
  function text(value, x, y, size = 18, color = colors.ink) { ctx.fillStyle = color; ctx.font = `${size >= 25 ? 'bold ' : ''}${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y); }
  function box(x,y,w,h,color) { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); }
  function button(label,x,y,w,h,action,color = colors.panel,font = 17) { box(x,y,w,h,color); text(label,x+w/2,y+h/2,font); buttons.push({x,y,w,h,action}); }
  const playerNames = { black: '黑方', white: '白方' };
  const seatIndex = (id,seat) => Records.BOARD_SEATS[id]?.indexOf(seat) ?? seat;
  const seatName = (id,seat) => id === 'ticTacToe' ? Records.BOARD_SEATS[id][seat] :
    id === 'gomoku' ? playerNames[Records.BOARD_SEATS[id][seat]] : `${seat+1} 号`;
  const nickname = id => journal.profiles[id-1];
  const isArchived = id => journal.archivedProfiles?.includes(id) ?? false;
  const matchPlayer = (match,seat) => nickname(match.players[seat]) || `游客 ${seatName(match.game,seat)}`;
  const namedPlayer = seat => nickname(roundPlayers[seatIndex(activeGame,seat)]);
  const extraUI = createExtraUI({
    ctx,text,box,button,seatText,seatButton,roundControls,saveStatus,render,
    label: seat => namedPlayer(seat) || playerLabel(seat),
    hit: button => buttons.push(button),
    update: next => {
      if (next === game) return;
      game = next;
      if (game.winner !== null || game.draw) saveMatch();
      render();
    },
    animate: step => {
      const running = game;
      const schedule = platform.requestFrame || (fn => setTimeout(() => fn(Date.now()),16));
      let previous;
      const frame = time => {
        if (scene !== 'game' || game !== running) return;
        const seconds = previous === undefined ? 0 : Math.max(0,Math.min(0.04,(time-previous)/1000));
        previous = time;
        step(running,seconds);
        if (running.winner !== null) saveMatch();
        render();
        if (running.phase === 'playing') schedule(frame);
      };
      render();
      schedule(frame);
    },
  });
  const boardRoster = () => roundPlayers.some(id => id !== null)
    ? roundPlayers.map((id,i) => `${seatName(activeGame,i)} · ${nickname(id) || '游客'}`).join('    ')
    : '';
  function newRound(firstSeat = 0) {
    const startingSeat = Records.BOARD_SEATS[activeGame][firstSeat];
    game = activeGame === 'gomoku' ? Gomoku.createGame(startingSeat) : createGame(startingSeat);
    roundFirst = firstSeat;
    finishedMatch = null;
    scene = 'game';
    render();
  }

  function openGame(id, choosePlayers = false, back = 'chooseGame') {
    activeGame = id;
    playerCount = 2;
    roundPlayers = [null,null];
    draftPlayers = roundPlayers.slice();
    if (choosePlayers) {
      openRoster(back,back === 'chooseGame' ? starterProfile : null);
      return;
    }
    if (variableCount(id)) {
      scene = 'setup';
      render();
      return;
    }
    if (EXTRA_IDS.has(id)) {
      startMultiplayer(0);
      return;
    }
    newRound();
  }

  function startMultiplayer(firstSeat) {
    const { rules } = GAMES.find(({ id }) => id === activeGame);
    rollingFlight = null;
    movingFlight = null;
    extraUI.reset();
    finishedMatch = null;
    roundFirst = firstSeat;
    game = rules.createGame(playerCount, firstSeat);
    scene = 'game';
    render();
  }

  function updateSeatStats(match) {
    if (match.game === 'ticTacToe') records = Records.recordSeatMatch(records,match);
    else if (match.game === 'gomoku') gomokuRecords = Records.recordSeatMatch(gomokuRecords,match);
    else {
      const byCount = multiplayerRecords.get(match.game);
      const count = match.players.length;
      byCount.set(count,Records.recordSeatMatch(byCount.get(count),match));
    }
  }

  function saveMatch() {
    const match = Records.finishedMatch(activeGame,game,roundPlayers,roundFirst);
    finishedMatch = match;
    journal.matches.push(match);
    updateSeatStats(match);
    saved = Records.save(storage,journal,Records.JOURNAL_KEY);
  }

  function playFlight(next) {
    if (next === game) return;
    game = next;
    if (game.winner !== null) saveMatch();
    render();
  }

  function rollFlight() {
    if (rollingFlight || game.die !== null) return;
    const round = game;
    const die = 1+Math.floor(Math.random()*6);
    const roll = { face: (die+1)%6+1 };
    rollingFlight = roll;
    render();

    [die%6+1,(die+3)%6+1,die].forEach((face,i) => {
      setTimeout(() => {
        if (rollingFlight !== roll) return;
        if (game !== round || scene !== 'game') {
          rollingFlight = null;
          return;
        }
        if (i === 2) {
          rollingFlight = null;
          playFlight(Flight.roll(round,die));
        } else {
          roll.face = face;
          render();
        }
      }, (i+1)*90);
    });
  }

  function moveFlight(plane) {
    if (movingFlight) return;
    const option = Flight.moveOption(game,plane);
    if (!option || option.reason) return;

    const round = game;
    const next = Flight.move(round,plane);
    const seat = round.turn;
    const start = round.planes[seat][plane];
    const pointAt = progress => Flight.planePoint(round.quarters[seat],plane,progress);
    const mover = { seat, plane, point: pointAt(start) };
    const motion = { pieces: [mover], hint: '飞行中…' };
    const legs = [];
    const landing = option.via ?? option.next;
    for (let step=start+1; step<=landing; step++) {
      legs.push({piece: mover, to: pointAt(step), frames: start === Flight.HANGAR ? 9 : 4, hint: '飞行中…'});
    }
    if (option.next > landing) {
      legs.push({piece: mover, to: pointAt(option.next), frames: 10, hint: option.action});
    }
    for (let step=landing-1; step>=option.next; step--) {
      legs.push({piece: mover, to: pointAt(step), frames: 6, hint: option.action});
    }
    if (option.capture) {
      const target = option.capture;
      const quarter = round.quarters[target.seat];
      const progress = round.planes[target.seat][target.plane];
      const piece = { ...target, point: Flight.planePoint(quarter,target.plane,progress) };
      legs.push({piece, to: Flight.planePoint(quarter,target.plane,Flight.HANGAR),
        frames: 11, hint: `撞回 ${target.seat+1} 号机库`});
    }
    movingFlight = motion;
    render();

    let index = 0, frame = 0, from = mover.point;
    function advance() {
      if (movingFlight !== motion) return;
      if (game !== round || scene !== 'game') {
        movingFlight = null;
        return;
      }
      if (index === legs.length) {
        movingFlight = null;
        playFlight(next);
        return;
      }
      const {piece,to,frames,hint} = legs[index];
      if (frame === 0 && piece !== mover) motion.pieces.push(piece);
      const ratio = ++frame/frames;
      piece.point = [from[0]+(to[0]-from[0])*ratio,from[1]+(to[1]-from[1])*ratio];
      motion.hint = hint;
      if (frame === frames) {
        frame = 0;
        index++;
        from = legs[index]?.piece.point;
      }
      render();
      setTimeout(advance,25);
    }
    setTimeout(advance,25);
  }

  function flipCard(index) {
    const next = Memory.flip(game, index);
    if (next === game) return;
    game = next;
    if (isMemoryDone(game)) {
      saveMatch();
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
    if (game.winner || game.draw) saveMatch();
    render();
  }

  function roundActions(done, confirm = platform.confirm) {
    const restart = () => {
      if (multiplayerRecords.has(activeGame)) {
        startMultiplayer(done ? (game.first + 1) % playerCount : game.first);
        return;
      }
      newRound(done ? 1-roundFirst : roundFirst);
    };
    const leave = () => { scene = 'home'; render(); };
    return {
      restart: () => done ? restart() : confirm('重新开局？未完成的对局不计入战绩。', restart),
      leave: () => done ? leave() : confirm('离开本局？未完成的对局不计入战绩。', leave),
    };
  }

  function roundControls(done, left, y, w) {
    const actions = roundActions(done);
    const rematch = multiplayerRecords.has(activeGame) ? '再来一局 · 轮换先手' : '再来一局 · 交换先手';
    button(done ? rematch : '重新开局（不计战绩）',left,y,w,48,actions.restart);
    if (done && roundPlayers.some(id => id !== null)) {
      const half = (w-8)/2;
      button('返回大厅',left,y+61,half,46,actions.leave);
      button('本局记录',left+half+8,y+61,half,46,openFinishedMatch);
    } else button('返回大厅',left,y+61,w,46,actions.leave);
  }

  function saveStatus() {
    return saved ? '战绩已保存在本机' : '保存失败，本次战绩仅在当前会话有效';
  }

  function drawGameCards(left, top, w, choosePlayers = false) {
    const cardWidth = (w-12)/2;
    const size = 4;
    GAMES.slice(gamePage*size,gamePage*size+size).forEach(({ id, title, description }, i) => {
      const x = left+(i%2)*(cardWidth+12);
      const y = top+150+Math.floor(i/2)*110;
      box(x,y,cardWidth,96,colors.panel);
      text(title,x+cardWidth/2,y+(choosePlayers ? 32 : 24),22);
      text(description,x+cardWidth/2,y+(choosePlayers ? 63 : 48),13,colors.muted);
      buttons.push({x,y,w:cardWidth,h:choosePlayers ? 96 : 63,action:() => openGame(id,choosePlayers)});
      if (!choosePlayers) button('选玩家 ›',x,y+63,cardWidth,33,() => openGame(id,true,'home'),'#2a3957',14);
    });
    pager(left+w/2,left,top+104,w,gamePage,GAMES.length,size,index => { gamePage = index; render(); });
  }

  function countButtons(left, y, w, selected, select) {
    const tabWidth = (w-16)/3;
    PLAYER_COUNTS.forEach((count,i) => {
      button(`${count} 人`,left+i*(tabWidth+8),y,tabWidth,44,() => select(count),
        count === selected ? '#395a69' : colors.panel);
    });
  }

  function go(next) {
    scene = next;
    render();
  }

  function openRoster(back, preferred = null) {
    rosterBack = back;
    draftPlayers = Array(playerCount).fill(null);
    draftPlayers[0] = preferred;
    go('roster');
  }

  function startWithPlayers(players) {
    roundPlayers = players.slice();
    if (multiplayerRecords.has(activeGame)) startMultiplayer(0);
    else newRound();
  }

  function editProfile(id, onSaved) {
    profileMessage = '';
    const message = id === null ? '输入本机玩家昵称（1–8 个字符）' : `修改「${nickname(id)}」的昵称（1–8 个字符）`;
    platform.prompt(message, value => {
      const name = value.trim();
      const duplicate = journal.profiles.findIndex((current,i) => current === name && i+1 !== id)+1;
      if (!name || [...name].length > 8 || /[\u0000-\u001f\u007f]/.test(name)) {
        profileMessage = '请输入 1–8 个字符的昵称';
      } else if (duplicate) {
        profileMessage = isArchived(duplicate) ? '该昵称已删除，可在「已删除」中恢复' : '这个昵称已存在';
      } else {
        const profiles = journal.profiles.slice();
        const profileId = id ?? profiles.length+1;
        profiles[profileId-1] = name;
        const next = { ...journal, profiles };
        if (Records.save(storage,next,Records.JOURNAL_KEY)) {
          journal = next;
          onSaved?.(profileId);
        } else profileMessage = '保存失败，请重试';
      }
      render();
    });
  }

  function chooseProfile(excluded, onSelect, back, allowGuest = false) {
    profileMessage = '';
    profilePicker = { excluded, onSelect, back, allowGuest, page: 0 };
    go('profilePicker');
  }

  function pager(cx,left,y,w,index,length,size,select) {
    const pages = Math.max(1,Math.ceil(length/size));
    if (pages === 1) return;
    text(`${index+1} / ${pages}`,cx,y+18,13,colors.muted);
    if (index > 0) button('上一页',left,y,80,36,() => select(index-1),colors.panel,14);
    if (index+1 < pages) button('下一页',left+w-80,y,80,36,() => select(index+1),colors.panel,14);
  }

  function drawRoster(cx,top,left,w) {
    const { title } = GAMES.find(item => item.id === activeGame);
    const multiplayer = variableCount(activeGame);
    text(`${title} · 选择玩家`,cx,top+68,24);
    if (multiplayer) countButtons(left,top+98,w,playerCount,count => {
      draftPlayers = Array.from({length:count},(_,i) => draftPlayers[i] ?? null);
      playerCount = count;
      render();
    });
    draftPlayers.forEach((id,i) => {
      button(`${seatName(activeGame,i)} · ${nickname(id) || '游客'}`,left,top+156+i*48,w,42,() => {
        chooseProfile(draftPlayers.filter((_,j) => i !== j), selected => { draftPlayers[i] = selected; }, 'roster', true);
      });
    });
    let previous;
    for (let i=journal.matches.length-1; i>=0; i--) {
      const match = journal.matches[i];
      if (match.game === activeGame && match.players.length === playerCount &&
          match.players.some(id => id !== null && !isArchived(id))) {
        previous = match;
        break;
      }
    }
    if (previous) button('沿用上次玩家',left,top+350,w,40,() => {
      draftPlayers = previous.players.map(id => isArchived(id) ? null : id);
      if (rosterBack === 'chooseGame' && starterProfile !== null && !draftPlayers.includes(starterProfile)) {
        const guest = draftPlayers.indexOf(null);
        draftPlayers[guest === -1 ? 0 : guest] = starterProfile;
      }
      render();
    });
    button('开始对局',left,top+400,w,48,() => startWithPlayers(draftPlayers),'#395a69');
    button('返回',left,top+460,w,42,() => go(rosterBack));
  }

  function drawProfilePicker(cx,top,left,w) {
    const picker = profilePicker;
    const select = id => {
      picker.onSelect(id);
      go(picker.back);
    };
    const available = journal.profiles.map((_,i) => i+1).filter(id => !isArchived(id) && !picker.excluded.includes(id));
    text('选择本机玩家',cx,top+68,25);
    if (picker.allowGuest) button('使用游客',left,top+105,w,40,() => select(null));
    available.slice(picker.page*5,picker.page*5+5).forEach((id,i) => {
      button(nickname(id),left,top+154+i*42,w,37,() => select(id));
    });
    if (!available.length) text('还没有可选的玩家档案',cx,top+195,15,colors.muted);
    pager(cx,left,top+366,w,picker.page,available.length,5,index => { picker.page = index; render(); });
    text(profileMessage,cx,top+419,13,colors.muted);
    button('新建玩家',left,top+435,w,44,() => editProfile(null,select),'#395a69');
    button('返回',left,top+491,w,42,() => go(picker.back));
  }

  function drawMemory(cx, top, left, w) {
    const done = isMemoryDone(game);
    const title = game.draw ? '配对数并列 · 平局' :
      done ? `${namedPlayer(game.winner) || playerLabel(game.winner)}获胜！` : `轮到${namedPlayer(game.turn) || playerLabel(game.turn)}`;
    text(title,cx,top+58,26);
    const scoreWidth = w/playerCount;
    const named = roundPlayers.some(id => id !== null);
    game.scores.forEach((score,seat) => {
      const x = left+(seat+0.5)*scoreWidth;
      if (named) drawSeatNickname(seat,x,top+88,scoreWidth,SEAT_COLORS[seat]);
      text(`${seat+1} 号 · ${score} 对`,x,top+(named ? 102 : 92),named ? 11 : 14,SEAT_COLORS[seat]);
    });

    const by = top+113;
    const size = Math.min(w,height-safeBottom-by-165);
    drawMemoryBoard(cx,by,size,!done);
    const y = by+size+12;
    const hint = game.open.length === 2 ? '未配对，即将换人' : '每次翻两张，配对成功可继续';
    text(done ? saveStatus() : hint,cx,y+14,13,colors.muted);
    roundControls(done,left,y+33,w);
  }

  function drawSeatNickname(seat,x,y,w,color) {
    const name = namedPlayer(seat) || '游客';
    const size = Math.min(13,(w-8)/Math.max(2,[...name].length));
    text(name,x,y,size,color);
  }

  function drawMemoryBoard(cx, by, size, playable) {
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
      if (playable && !matched && !open && game.open.length < 2) {
        buttons.push({x,y,w:cell,h:cell,action:() => flipCard(i)});
      }
    });
  }

  function drawFlight(cx, top, left, w) {
    const done = game.winner !== null;
    const activeColor = FLIGHT_COLORS[game.turn];
    text(done ? `${namedPlayer(game.winner) || playerLabel(game.winner)}获胜！` : `轮到${namedPlayer(game.turn) || playerLabel(game.turn)}`,cx,top+58,26,activeColor);
    const named = roundPlayers.some(id => id !== null);
    game.planes.forEach((pair,seat) => {
      const arrived = pair.filter(progress => progress === Flight.FINISH).length;
      const tile = w/playerCount;
      const x = left+seat*tile;
      box(x+2,top+81,tile-4,26,seat === game.turn && !done ? '#344461' : colors.panel);
      box(x+2,top+81,tile-4,2,FLIGHT_COLORS[seat]);
      if (named) drawSeatNickname(seat,x+tile/2,top+90,tile,FLIGHT_COLORS[seat]);
      text(`${seat+1} 号 · ${arrived}/2`,x+tile/2,top+(named ? 101 : 95),named ? 10 : 13,FLIGHT_COLORS[seat]);
    });

    const by = top+113;
    const size = Math.min(w,height-safeBottom-by-234);
    drawFlightBoard(cx,by,size,!done);
    const y = by+size+10;
    text(done ? saveStatus() : flightHint(),cx,y+14,13,colors.muted);
    if (!done) {
      flightControls(left,y+29,w,false);
      text('★ 顺风 +4　 + 补给再掷　 −2 乱流',cx,y+93,12,colors.muted);
    }
    roundControls(done,left,done ? y+33 : y+108,w);
  }

  function flightHint(showLegend = false) {
    if (movingFlight) return movingFlight.hint;
    if (rollingFlight) return '骰子转动中…';
    if (game.die !== null) return '点棋盘上的高亮飞机';
    if (game.lastRoll === null) return showLegend ? '★ 顺风 +4　 + 补给再掷　 −2 乱流' : '偶数起飞 · 掷 6 可再掷';
    return `${game.lastRollBy+1} 号 · ${game.notice}`;
  }

  function flightDot(x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x,y,radius,0,Math.PI*2);
    ctx.fill();
  }

  function flightDice(x, y, w, reversed) {
    const roller = rollingFlight ? game.turn : game.lastRollBy;
    const face = rollingFlight?.face ?? game.lastRoll;
    const dx = x+(reversed ? w-19 : 19), dy = y+25;
    const numberX = x+(reversed ? 19 : w-19);
    box(x,y,w,50,face === null ? '#30425a' : '#f4f5eb');
    if (face === null) {
      seatText('骰点',x+w/2,dy,15,colors.muted,reversed);
      return;
    }
    box(x,y,w,3,FLIGHT_COLORS[roller]);
    box(dx-14,dy-14,28,28,'#14253b');
    const pip = (u,v) => flightDot(dx+u,dy+v,2,FLIGHT_COLORS[roller]);
    if (face%2) pip(0,0);
    if (face >= 2) { pip(-7,-7); pip(7,7); }
    if (face >= 4) { pip(-7,7); pip(7,-7); }
    if (face === 6) { pip(-7,0); pip(7,0); }
    seatText(rollingFlight ? '…' : String(face),numberX,dy,29,'#14253b',reversed);
  }

  function flightControls(left, y, w, reversed, seat = game.turn) {
    const color = FLIGHT_COLORS[game.turn];
    const diceWidth = 74;
    const gap = 6;
    flightDice(reversed ? left+w-diceWidth : left,y,diceWidth,reversed);
    if (!reversed) left += diceWidth+gap;
    w -= diceWidth+gap;
    if (seat !== game.turn) {
      const arrived = game.planes[seat].filter(progress => progress === Flight.FINISH).length;
      seatText(`你已送达 ${arrived}/2 架`,left+w/2,y+25,15,colors.muted,reversed);
      return;
    }
    if (movingFlight) {
      box(left,y,w,50,colors.panel);
      seatText('正在移动飞机',left+w/2,y+25,15,color,reversed);
      return;
    }
    if (game.die === null) {
      box(left,y,w,50,rollingFlight ? colors.panel : color);
      seatText(rollingFlight ? '掷骰中…' : '掷骰子',left+w/2,y+25,17,
        rollingFlight ? colors.muted : '#14253b',reversed);
      if (!rollingFlight) buttons.push({x:left,y,w,h:50,action:rollFlight});
      return;
    }
    const half = w/2;
    box(left+w/2,y+9,1,32,'#344962');
    ['A','B'].forEach((label,plane) => {
      const column = reversed ? 1-plane : plane;
      const x = left+column*half;
      const option = Flight.moveOption(game,plane);
      const legal = !option.reason;
      const headingY = reversed ? y+35 : y+15;
      const detailY = reversed ? y+15 : y+35;
      seatText(`飞机 ${label}`,x+half/2,headingY,14,
        legal ? colors.ink : colors.muted,reversed);
      const detail = option.reason || (option.extraRoll ? '补给 · 再掷' : option.action);
      const suffix = option.capture ? ' · 撞机' : '';
      seatText(detail+suffix,x+half/2,detailY,11,legal ? color : colors.muted,reversed);
    });
  }

  function drawFlightBoard(cx, by, size, playable, facingBoard = false) {
    const bx = cx-size/2;
    const cell = size/Flight.GRID_SIZE;
    const orient = point => Flight.rotate(...point,facingBoard ? 2 : 0);
    const center = ([col,row]) => [bx+(col+0.5)*cell,by+(row+0.5)*cell];
    const spot = point => center(orient(point));
    const tile = (point, color, label = '', ink = colors.ink) => {
      const [x,y] = spot(point);
      box(x-cell/2+1,y-cell/2+1,cell-2,cell-2,color);
      if (label) text(label,x,y,cell*0.35,ink);
    };

    box(bx-4,by-4,size+8,size+8,'#324660');
    box(bx,by,size,size,'#0d1c30');
    const segment = Flight.LAP/4;
    const arrows = ['→','↓','←','↑'];
    for (let i=0; i<Flight.LAP; i++) {
      const point = Flight.trackPoint(i);
      const next = Flight.trackPoint((i+1)%Flight.LAP);
      const dx = next[0]-point[0], dy = next[1]-point[1];
      const direction = dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3;
      const arrow = arrows[(direction+(facingBoard ? 2 : 0))%4];
      const special = FLIGHT_TILES[Flight.trackEffect(i)];
      tile(point,special?.fill ?? (i%2 ? '#3c536a' : '#354960'),
        special?.symbol ?? (i%segment === 5 ? arrow : ''),special?.ink ?? '#ced9e8');
      if (!special && i%segment !== 5) flightDot(...spot(point),cell*0.045,'#899bb3');
    }

    for (let quarter=0; quarter<4; quarter++) {
      const seat = game.quarters.indexOf(quarter);
      const enabled = seat !== -1;
      const active = enabled && seat === game.turn && game.winner === null;
      const color = enabled ? FLIGHT_COLORS[seat] : '#64748c';
      const reversed = facingBoard && seat === 1;
      const sign = reversed ? -1 : 1;
      const [x,y] = spot(Flight.rotate(1,1,quarter));
      if (enabled) {
        const half = cell*1.05;
        box(x-half,y-cell*0.60,half*2,cell*1.20,active ? color : '#344962');
        box(x-half+2,y-cell*0.60+2,half*2-4,cell*1.20-4,'#192e44');
        seatText(`${seat+1} 号机库`,x,y-sign*cell*0.88,cell*0.38,color,reversed);
        const arrived = game.planes[seat].filter(progress => progress === Flight.FINISH).length;
        for (let i=0; i<2; i++) flightDot(x+(i-0.5)*cell*0.32,y+sign*cell*0.83,cell*0.07,
          i < arrived ? color : '#60728b');
        for (let plane=0; plane<2; plane++) {
          const [px,py] = spot(Flight.planePoint(quarter,plane,Flight.HANGAR));
          flightDot(px,py,cell*0.37,'#324a62');
        }
        tile(Flight.planePoint(quarter,0,0),color,'起','#14253b');
      }
      for (let progress=Flight.LAP; progress<Flight.FINISH; progress++) {
        const point = Flight.planePoint(quarter,0,progress);
        tile(point,enabled ? '#24394f' : '#1c2d41',enabled ? arrows[(quarter+1+(facingBoard ? 2 : 0))%4] : '',color);
      }
    }
    tile(Flight.planePoint(0,0,Flight.FINISH),'#d3e9ed','终点','#14253b');
    game.quarters.forEach((quarter,seat) => {
      tile(Flight.planePoint(quarter,0,Flight.WIND),'#293e56','★',FLIGHT_COLORS[seat]);
    });

    const landings = new Map();
    const choices = playable && !movingFlight && game.die !== null ? [Flight.moveOption(game,0),Flight.moveOption(game,1)] : [];
    choices.forEach((option,plane) => {
      if (option.reason) return;
      const quarter = game.quarters[game.turn];
      const point = Flight.planePoint(quarter,plane,option.next);
      const key = point.join(',');
      const label = plane === 0 ? 'A' : 'B';
      const marker = landings.get(key);
      landings.set(key,{ point, label: marker ? `${marker.label}/${label}` : label });
      if (option.via !== undefined) {
        const start = Math.min(option.via,option.next);
        const end = Math.max(option.via,option.next);
        for (let step=start+1; step<end; step++) {
          flightDot(...spot(Flight.planePoint(quarter,plane,step)),cell*0.10,FLIGHT_COLORS[game.turn]);
        }
      }
    });
    for (const { point } of landings.values()) {
      const [x,y] = spot(point);
      const border = cell*0.46;
      ctx.strokeStyle = '#d8eda2';
      ctx.lineWidth = 2;
      ctx.strokeRect(x-border,y-border,border*2,border*2);
    }

    const animatedPieces = movingFlight?.pieces ?? [];
    function drawPlane(seat,plane,point,animated = false) {
      const [x,y] = spot(point);
      const selectable = seat === game.turn && choices[plane] && !choices[plane].reason;
      const recent = seat === game.lastMove?.seat && plane === game.lastMove?.plane;
      if (selectable || animated || recent) flightDot(x,y,cell*0.47,selectable || animated ? '#fff9e9' : '#8fa9c8');
      flightDot(x,y,cell*0.40,'#111f34');
      flightDot(x,y-cell*0.025,cell*0.35,FLIGHT_COLORS[seat]);
      const reversed = facingBoard && seat === 1;
      const sign = reversed ? -1 : 1;
      seatText('✈︎',x,y-sign*cell*0.11,cell*0.33,'#14253b',reversed);
      seatText(`${seat+1}${plane === 0 ? 'A' : 'B'}`,x,y+sign*cell*0.14,cell*0.25,'#14253b',reversed);
      if (selectable) buttons.push({x:x-cell/2,y:y-cell/2,w:cell,h:cell,action:() => moveFlight(plane)});
    }
    game.planes.forEach((pair,seat) => {
      pair.forEach((progress,plane) => {
        if (progress === Flight.FINISH || animatedPieces.some(piece => piece.seat === seat && piece.plane === plane)) return;
        drawPlane(seat,plane,Flight.planePoint(game.quarters[seat],plane,progress));
      });
    });
    animatedPieces.forEach(({seat,plane,point}) => drawPlane(seat,plane,point,true));
    for (const { point, label } of landings.values()) {
      const [x,y] = spot(point);
      const reversed = facingBoard && game.turn === 1;
      const markerY = y+(reversed ? -1 : 1)*cell*0.36;
      box(x-cell*0.40,markerY-cell*0.13,cell*0.80,cell*0.26,'#f2f7bd');
      seatText(label,x,markerY,cell*0.25,'#182817',reversed);
    }
  }

  function drawGomoku(cx, top, left, w) {
    const done = game.winner || game.draw;
    text(game.draw ? '默契平局！' : game.winner ? (namedPlayer(game.winner) || playerNames[game.winner])+'获胜！' :
      (namedPlayer(game.turn) || playerNames[game.turn])+'落子',cx,top+58,28);
    text(boardRoster() || '横、竖或斜向连成五子及以上获胜',cx,top+89,14,colors.muted);

    const by = top+110;
    const size = Math.min(w, height-safeBottom-by-165);
    drawGomokuBoard(cx,by,size,!done);
    const y = by+size+12;
    text(done ? saveStatus() : '轻点空交叉点落子',cx,y+14,13,colors.muted);
    roundControls(done,left,y+33,w);
  }

  function drawGomokuBoard(cx, by, size, playable) {
    const { SIZE } = Gomoku;
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

    if (playable) {
      buttons.push({x:bx,y:by,w:size,h:size,action:(x,y) => {
        const index = Math.floor((y-by)/step)*SIZE + Math.floor((x-bx)/step);
        commitMove(index);
      }});
    }
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

  function seatText(value, x, y, size, color, reversed) {
    if (!reversed) { text(value,x,y,size,color); return; }
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(Math.PI);
    text(value,0,0,size,color);
    ctx.restore();
  }

  function seatButton(label, x, y, w, h, reversed, action, color = colors.panel) {
    box(x,y,w,h,color);
    seatText(label,x+w/2,y+h/2,15,action ? colors.ink : colors.muted,reversed);
    if (action) buttons.push({x,y,w,h,action});
  }

  function drawFacing(cx, top, left, w) {
    const gomoku = activeGame === 'gomoku';
    const memory = activeGame === 'memory';
    const flight = activeGame === 'flight';
    const multiplayer = memory || flight;
    const done = game.winner !== null || game.draw;
    const playable = !done && !seatPrompt;
    const lower = height-safeBottom;
    const inset = flight ? 164 : 112;
    const boardTop = top+inset;
    const boardBottom = lower-inset;
    const size = Math.min(w,boardBottom-boardTop);
    const y = (boardTop+boardBottom-size)/2;
    if (gomoku) drawGomokuBoard(cx,y,size,playable);
    else if (memory) drawMemoryBoard(cx,y,size,playable);
    else if (flight) drawFlightBoard(cx,y,size,playable,true);
    else drawTicBoard(game,cx,y,size,playable ? commitMove : null);

    const actions = roundActions(done,(message,accept) => {
      seatPrompt = { message, accept };
      render();
    });
    const closePrompt = accepted => {
      const { accept } = seatPrompt;
      seatPrompt = null;
      if (accepted) accept();
      else render();
    };
    const names = multiplayer ? ['1 号','2 号'] : gomoku ? playerNames : { X: 'X', O: 'O' };
    const outcome = game.draw ? '平局' : done ? `${namedPlayer(game.winner) || names[game.winner]}获胜！` : '';
    const controls = seatPrompt
      ? [['取消',() => closePrompt(false)],['确认',() => closePrompt(true)]]
      : [['改为并排',toggleSeating],[done ? '再来一局' : '重开',actions.restart],['回大厅',actions.leave]];
    if (done && !seatPrompt && roundPlayers.some(id => id !== null)) controls.push(['本局记录',openFinishedMatch]);
    const gap = 8;
    const buttonWidth = (w-gap*(controls.length-1))/controls.length;
    const seats = multiplayer ? [1,0] : gomoku ? ['white','black'] : ['O','X'];
    seats.forEach((seat,i) => {
      const reversed = i === 0;
      const controlsY = reversed ? top+3 : lower-48;
      const titleY = reversed ? top+63 : lower-66;
      const hintY = reversed ? top+89 : lower-92;
      const active = !done && seat === game.turn;
      const nickname = namedPlayer(seat);
      const turnLabel = nickname ? `${names[seat]} · ${nickname}` : multiplayer ? `${names[seat]}玩家` : `你执 ${names[seat]}`;
      const waiting = memory || flight ? '等对方操作' : '等对方落子';
      const title = seatPrompt ? '请确认操作' : outcome || `${turnLabel} · ${active ? '轮到你' : waiting}`;
      let hint = gomoku ? '横竖斜连成五子或以上获胜' : '横竖斜连成三子获胜';
      if (memory) {
        hint = `已配对 ${game.scores[seat]} 对 · ${game.open.length === 2 ? '未配对，即将换人' : '配对成功可继续'}`;
      } else if (flight) {
        hint = flightHint(true);
      }
      if (done) hint = memory ? `配对 ${game.scores[seat]} 对 · ${saveStatus()}` : saveStatus();
      seatText(title,cx,titleY,nickname && !done ? 17 : 21,active && !seatPrompt ? (flight ? FLIGHT_COLORS[seat] : '#ffd67d') : colors.ink,reversed);
      seatText(seatPrompt?.message || hint,cx,hintY,13,colors.muted,reversed);
      if (flight && !seatPrompt) {
        const actionY = reversed ? top+106 : lower-157;
        if (!done) flightControls(left,actionY,w,reversed,seat);
        else {
          const arrived = game.planes[seat].filter(progress => progress === Flight.FINISH).length;
          seatText(`你已送达 ${arrived}/2 架`,cx,actionY+22,15,FLIGHT_COLORS[seat],reversed);
        }
      }
      controls.forEach(([label,action],index) => {
        const column = reversed ? controls.length-1-index : index;
        const x = left+column*(buttonWidth+gap);
        seatButton(label,x,controlsY,buttonWidth,40,reversed,action,
          label === '确认' ? '#395a69' : colors.panel);
      });
    });
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

  function dateLabel(timestamp) {
    const date = new Date(timestamp);
    const two = value => String(value).padStart(2,'0');
    return `${date.getFullYear()}-${two(date.getMonth()+1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
  }

  function outcomeLabel(match) {
    return match.winner === null ? '平局' : `${matchPlayer(match,match.winner)}获胜`;
  }

  function openFinishedMatch() {
    recordsGame = finishedMatch.game;
    recordsCount = finishedMatch.players.length;
    recordsTab = 'history';
    historyProfile = null;
    page = 0;
    selectedMatch = finishedMatch;
    go('matchDetail');
  }

  function drawHistory(matches,cx,top,left,w) {
    const ordered = matches.slice().reverse();
    const filtered = historyProfile !== null;
    if (filtered) button(`仅看 ${nickname(historyProfile)} · 清除`,left,top+203,w,27,() => {
      historyProfile = null;
      page = 0;
      render();
    },colors.panel,13);
    if (!ordered.length) text('暂无逐局记录，完成一局后自动保存',cx,top+252,15,colors.muted);
    ordered.slice(page*3,page*3+3).forEach((match,i) => {
      const y = top+(filtered ? 236+i*48 : 210+i*51);
      box(left,y,w,46,colors.panel);
      text(`${outcomeLabel(match)} · ${match.players.length} 人 ›`,cx,y+14,16);
      text(dateLabel(match.endedAt),cx,y+34,12,colors.muted);
      buttons.push({x:left,y,w,h:46,action:() => { selectedMatch = match; go('matchDetail'); }});
    });
    pager(cx,left,top+(filtered ? 383 : 369),w,page,ordered.length,3,index => { page = index; render(); });
  }

  function drawMatchDetail(cx,top,left,w) {
    const match = selectedMatch;
    const extra = EXTRA_GAMES.find(item => item.id === match.game);
    text(GAMES.find(item => item.id === match.game).title,cx,top+70,26);
    text(`${dateLabel(match.endedAt)} · ${match.players.length} 人`,cx,top+106,14,colors.muted);
    text(outcomeLabel(match),cx,top+145,24);
    if (match.moves !== undefined) text(`共 ${match.moves} ${extra?.unit || '手'}`,cx,top+173,13,colors.muted);
    match.players.forEach((_,i) => {
      const y = top+195+i*48;
      const unit = extra?.unit || (match.game === 'memory' ? '对' : '架送达');
      const score = match.scores ? ` · ${match.scores[i]} ${unit}` : '';
      box(left,y,w,42,colors.panel);
      text(`${seatName(match.game,i)} · ${matchPlayer(match,i)}${i === match.first ? ' · 先手' : ''}${score}`,cx,y+21,14);
    });
    button('返回逐局历史',left,top+425,w,46,() => go('records'));
  }

  function drawFriends(matches,cx,top,left,w) {
    const half = (w-8)/2;
    friends.forEach((id,i) => {
      button(nickname(id) || (i === 0 ? '选好友 A' : '选好友 B'),left+i*(half+8),top+207,half,38,() => {
        chooseProfile([friends[1-i]], selected => { friends[i] = selected; }, 'records');
      },colors.panel,15);
    });
    if (friends.every(id => id !== null)) {
      const result = Records.friendResults(matches,...friends);
      text(`共同完成 ${result.rounds} 局`,cx,top+268,16);
      text(`${result.aWins} 胜`,left+half/2,top+301,21);
      text(`${result.bWins} 胜`,left+half*1.5+8,top+301,21);
      text(`平局 ${result.draws} · 其他玩家获胜 ${result.otherWins}`,cx,top+333,13,colors.muted);
      button('返回同机胜场榜',left,top+360,w,38,() => {
        friends.fill(null);
        page = 0;
        render();
      },colors.panel,14);
      return;
    }
    const standings = Records.friendStandings(matches).filter(row => !isArchived(row.id));
    if (!standings.length) text('至少两名档案玩家同局后上榜',cx,top+288,15,colors.muted);
    standings.slice(page*3,page*3+3).forEach(({id,wins,rounds},i) => {
      const rank = standings.findIndex(row => row.wins === wins)+1;
      text(`${rank}. ${nickname(id)} · ${wins} 胜 / ${rounds} 局`,cx,top+268+i*34,16);
    });
    pager(cx,left,top+365,w,page,standings.length,3,index => { page = index; render(); });
  }

  function drawProfiles(cx,top,left,w) {
    const ids = journal.profiles.map((_,i) => i+1).filter(id => isArchived(id) === showArchived);
    const half = (w-8)/2;
    ['使用中','已删除'].forEach((label,i) => {
      button(label,left+i*(half+8),top+106,half,34,() => {
        showArchived = i === 1;
        page = 0;
        profileMessage = '';
        render();
      },showArchived === (i === 1) ? '#395a69' : colors.panel,14);
    });
    if (!ids.length) text(showArchived ? '没有已删除的玩家' : '还没有玩家档案',cx,top+183,16,colors.muted);
    ids.slice(page*4,page*4+4).forEach((id,i) => {
      button(`${nickname(id)} ›`,left,top+151+i*44,w,38,() => openProfile(id));
    });
    pager(cx,left,top+329,w,page,ids.length,4,index => { page = index; render(); });
    text(profileMessage,cx,top+363,13,colors.muted);
    if (!showArchived) button('新建玩家',left,top+375,w,38,() => editProfile(null,openProfile),'#395a69');
  }

  function openProfile(id) {
    profileDetail = id;
    profileMessage = '';
    go('profileDetail');
  }

  function setProfileArchived(id, archived) {
    const ids = journal.archivedProfiles ?? [];
    const next = { ...journal, archivedProfiles: archived ? [...ids,id] : ids.filter(value => value !== id) };
    if (!Records.save(storage,next,Records.JOURNAL_KEY)) {
      profileMessage = '保存失败，请重试';
      render();
      return;
    }
    journal = next;
    friends.forEach((value,i) => { if (value === id && archived) friends[i] = null; });
    showArchived = false;
    recordsTab = 'profiles';
    page = 0;
    profileMessage = archived ? '玩家已删除，可在「已删除」中恢复' : '玩家已恢复';
    go('records');
  }

  function drawProfileDetail(cx,top,left,w) {
    const id = profileDetail;
    const archived = isArchived(id);
    const matches = journal.matches.filter(match => match.players.includes(id));
    text(nickname(id),cx,top+71,28);
    text(archived ? '已删除 · 历史仍保留' : '本机玩家档案',cx,top+109,14,colors.muted);
    const wins = matches.filter(match => match.players[match.winner] === id).length;
    text(`${matches.length} 局 · ${wins} 胜`,cx,top+151,21);
    button('查看对局历史',left,top+181,w,43,() => {
      const latest = matches[matches.length-1];
      if (latest) {
        recordsGame = latest.game;
        recordsCount = latest.players.length;
      }
      historyProfile = id;
      recordsTab = 'history';
      page = 0;
      go('records');
    });
    if (archived) {
      button('恢复玩家',left,top+237,w,44,() => setProfileArchived(id,false),'#395a69');
    } else {
      button('用该玩家开局',left,top+237,w,44,() => {
        starterProfile = id;
        go('chooseGame');
      },'#395a69');
      button('编辑昵称',left,top+291,w,42,() => editProfile(id));
      button('删除玩家',left,top+343,w,42,() => platform.confirm(
        `删除「${nickname(id)}」？对局历史会保留，可在「已删除」中恢复玩家。`,
        () => setProfileArchived(id,true)
      ),'#523345');
    }
    text(profileMessage,cx,top+407,13,colors.muted);
    button('返回玩家档案',left,top+427,w,43,() => go('records'));
  }

  function drawSeatStats(cx,top,left,w) {
    const recordsByCount = multiplayerRecords.get(recordsGame);
    const count = variableCount(recordsGame) ? recordsCount : 2;
    const stats = recordsByCount ? recordsByCount.get(count) :
      recordsGame === 'gomoku' ? gomokuRecords : records;
    const statsY = recordsByCount ? top+219 : top+175;
    const summary = `完成 ${stats.rounds} 局`;
    text(recordsGame === 'flight' ? summary : `${summary} · 平局 ${stats.draws} 局`,cx,statsY,17,colors.muted);
    if (recordsByCount) {
      if (variableCount(recordsGame)) countButtons(left,top+156,w,count,value => { recordsCount = value; render(); });
      stats.wins.forEach((wins,seat) => {
        const y = top+242+seat*43;
        box(left,y,w,37,colors.panel);
        text(`${playerLabel(seat)} · ${wins} 胜`,cx,y+18,17,(recordsGame === 'flight' ? FLIGHT_COLORS : SEAT_COLORS)[seat]);
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
  }

  function drawRecords(cx,top,left,w) {
    text('本机战绩',cx,top+69,29);
    if (recordsTab === 'profiles') drawProfiles(cx,top,left,w);
    else {
      const size = 4, offset = Math.floor(GAMES.findIndex(item => item.id === recordsGame)/size)*size;
      const tabWidth = (w-16)/size;
      const select = id => { recordsGame = id; page = 0; render(); };
      if (offset > 0) button('上组',left,top+53,53,31,() => select(GAMES[offset-size].id),colors.panel,13);
      if (offset+size < GAMES.length) {
        button('下组',left+w-53,top+53,53,31,() => select(GAMES[offset+size].id),colors.panel,13);
      }
      GAMES.slice(offset,offset+size).forEach(({ id, title },i) => {
        button(title,left+i*(tabWidth+8),top+105,tabWidth,42,() => {
          select(id);
        },recordsGame === id ? '#395a69' : colors.panel,Math.min(15,(tabWidth-4)/[...title].length));
      });
      if (recordsTab === 'seats') drawSeatStats(cx,top,left,w);
      else {
        const count = variableCount(recordsGame) ? recordsCount : 2;
        if (variableCount(recordsGame)) countButtons(left,top+156,w,count,value => {
          recordsCount = value;
          page = 0;
          render();
        });
        const matches = journal.matches.filter(match => match.game === recordsGame && match.players.length === count);
        if (recordsTab === 'history') drawHistory(historyProfile === null ? matches :
          matches.filter(match => match.players.includes(historyProfile)),cx,top,left,w);
        else drawFriends(matches,cx,top,left,w);
      }
    }
    const width = (w-12)/RECORD_TABS.length;
    RECORD_TABS.forEach(([id,label],i) => {
      button(label,left+i*(width+4),top+423,width,40,() => {
        recordsTab = id;
        page = 0;
        profileMessage = '';
        render();
      },recordsTab === id ? '#395a69' : colors.panel,13);
    });
    button('返回大厅',left,top+470,w,50,() => go('home'));
  }

  function render() {
    buttons = []; box(0,0,width,height,colors.bg);
    const cx = width/2, top = Math.max(30, platform.safeTop || 0), w = Math.min(width-40,400), left = cx-w/2;
    const extraGame = scene === 'game' && EXTRA_IDS.has(activeGame);
    const seatingGame = scene === 'game' && !extraGame && (!multiplayerRecords.has(activeGame) || playerCount === 2);
    if (seatingGame && facing) { drawFacing(cx,top,left,w); return; }
    if (seatingGame) button('座位：并排 · 切换面对面',left,top,w,34,toggleSeating);
    else if (!extraGame || (activeGame !== 'pong' && activeGame !== 'hockey')) text('DUO / 一起玩',cx,top+15,15,colors.O);
    if (scene === 'home') {
      text('双人互动小游戏大全',cx,top+76,26);
      drawGameCards(left,top,w);
      if (online) button('井字棋 · 好友联机',left,top+369,w,49,() => {
        scene = 'online';
        online.open();
        render();
      },'#395a69');
      button('本机战绩',left,top+434,w,50,()=>{scene='records';render();});
      const half = (w-8)/2;
      button('选玩家开局',left,top+493,half,42,() => {
        starterProfile = null;
        go('chooseGame');
      });
      button('玩家档案',left+half+8,top+493,half,42,() => {
        recordsTab = 'profiles';
        showArchived = false;
        page = 0;
        profileMessage = '';
        go('records');
      });
      text('无需登录 · 战绩仅保存在此设备',cx,top+557,13,colors.muted);
    } else if (scene === 'online' || scene === 'roomCode') {
      drawOnline(cx,top,left,w);
    } else if (scene === 'setup') {
      const { title, start } = GAMES.find(({ id }) => id === activeGame);
      text(title,cx,top+76,29);
      text('选择同屏玩家人数',cx,top+123,17,colors.muted);
      countButtons(left,top+150,w,playerCount,count => { playerCount = count; render(); });
      button(start || '开始对局',left,top+218,w,48,() => startWithPlayers(Array(playerCount).fill(null)),'#395a69');
      button('返回大厅',left,top+280,w,46,() => { scene = 'home'; render(); });
      if (activeGame === 'flight') {
        box(left,top+350,w,125,colors.panel);
        text('快局玩法',cx,top+370,16,colors.ink);
        text('偶数起飞 · 掷 6 可再掷一次',cx,top+394,14,colors.muted);
        text('★ 同色顺风 +4 格 · + 补给再掷',cx,top+415,14,colors.muted);
        text('−2 乱流退两格 · 最终落点可撞机',cx,top+436,14,colors.muted);
        text('先让两架飞机刚好抵达终点',cx,top+457,14,colors.muted);
      }
      button('选本机玩家',left,top+(activeGame === 'flight' ? 487 : 339),w,42,() => openRoster('setup'));
    } else if (scene === 'chooseGame') {
      text('选玩家开局',cx,top+76,26);
      if (starterProfile) text(`已选 ${nickname(starterProfile)}`,cx,top+95,13,colors.muted);
      drawGameCards(left,top,w,true);
      button(starterProfile ? '返回玩家档案' : '返回大厅',left,top+434,w,50,() => go(starterProfile ? 'profileDetail' : 'home'));
    } else if (scene === 'roster') {
      drawRoster(cx,top,left,w);
    } else if (scene === 'profilePicker') {
      drawProfilePicker(cx,top,left,w);
    } else if (scene === 'matchDetail') {
      drawMatchDetail(cx,top,left,w);
    } else if (scene === 'profileDetail') {
      drawProfileDetail(cx,top,left,w);
    } else if (scene === 'records') {
      drawRecords(cx,top,left,w);
    } else if (extraGame) {
      extraUI.draw(activeGame,game,{cx,top,left,w,bottom:height-safeBottom});
    } else if (activeGame === 'flight') {
      drawFlight(cx,top,left,w);
    } else if (activeGame === 'memory') {
      drawMemory(cx,top,left,w);
    } else if (activeGame === 'gomoku') {
      drawGomoku(cx,top,left,w);
    } else {
      const done = game.winner || game.draw;
      text(done ? (game.draw ? '默契平局！' : `${namedPlayer(game.winner) || '玩家 '+game.winner} 获胜！`) : `轮到${namedPlayer(game.turn) || '玩家 '+game.turn}`,cx,top+68,28,game.winner ? colors[game.winner] : colors.ink);
      text(boardRoster() || '先连成横、竖或斜向三子即获胜',cx,top+106,14,colors.muted);
      const size = Math.min(w, height-top-330), by = top+140;
      drawTicBoard(game,cx,by,size,done ? null : commitMove);
      const y=by+size+20;
      text(done ? saveStatus() : '玩家 X（暖橙） vs 玩家 O（薄荷）',cx,y,13,colors.muted);
      roundControls(done,left,y+28,w);
    }
  }
  function resize() { const info=platform.size(); scale=Math.min(1,info.height/650);width=info.width/scale; height=info.height/scale; safeBottom=(info.safeBottom || 0)/scale; const dpr=info.dpr||1; canvas.width=Math.round(info.width*dpr);canvas.height=Math.round(info.height*dpr);ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);render(); }
  platform.onPointer?.((type,id,x,y) => {
    if (scene === 'game' && EXTRA_IDS.has(activeGame)) extraUI.pointer(type,id,x/scale,y/scale);
  });
  platform.onTap((x,y)=>{x/=scale;y/=scale;const hit=buttons.find(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h);if(hit)hit.action(x,y);});
  platform.onResize(resize); resize();
}
module.exports = { start };
