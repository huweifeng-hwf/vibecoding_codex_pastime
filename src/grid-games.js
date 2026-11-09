'use strict';

const COLUMNS = 7, ROWS = 6;
const Connect = {
  COLUMNS, ROWS,
  createGame: (_,first = 0) => ({
    first, turn: first, board: Array(COLUMNS*ROWS).fill(null), line: [], winner: null, draw: false, moves: 0,
  }),
  drop(game,column) {
    if (game.winner !== null || game.draw || !Number.isInteger(column) || column < 0 || column >= COLUMNS) return game;
    let row = ROWS-1;
    while (row >= 0 && game.board[row*COLUMNS+column] !== null) row--;
    if (row < 0) return game;
    const board = game.board.slice();
    const index = row*COLUMNS+column;
    board[index] = game.turn;
    for (const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]) {
      const line = [index];
      for (const sign of [-1,1]) {
        let x = column+dx*sign, y = row+dy*sign;
        while (x >= 0 && x < COLUMNS && y >= 0 && y < ROWS && board[y*COLUMNS+x] === game.turn) {
          line.push(y*COLUMNS+x);
          x += dx*sign;
          y += dy*sign;
        }
      }
      if (line.length >= 4) return { ...game, board, line, winner: game.turn, moves: game.moves+1 };
    }
    const moves = game.moves+1;
    return { ...game, board, moves, turn: 1-game.turn, draw: moves === board.length };
  },
};

const SIZE = 9;
const DIRECTIONS = [[1,0],[-1,0],[0,1],[0,-1]];
const inBoard = (x,y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;
const goalRow = seat => seat === 0 ? 0 : SIZE-1;
const coordinates = cell => [cell%SIZE, Math.floor(cell/SIZE)];

function neighbor(walls,cell,dx,dy) {
  const [x,y] = coordinates(cell);
  if (!inBoard(x+dx,y+dy)) return null;
  const blocked = walls.some(wall => dx
    ? wall.axis === 'v' && wall.x === Math.min(x,x+dx) && (wall.y === y || wall.y+1 === y)
    : wall.axis === 'h' && wall.y === Math.min(y,y+dy) && (wall.x === x || wall.x+1 === x));
  return blocked ? null : cell+dx+dy*SIZE;
}

function hasPath(walls,start,seat) {
  const queue = [start];
  const visited = new Set(queue);
  for (let i=0;i<queue.length;i++) {
    const cell = queue[i];
    if (coordinates(cell)[1] === goalRow(seat)) return true;
    for (const [dx,dy] of DIRECTIONS) {
      const next = neighbor(walls,cell,dx,dy);
      if (next !== null && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

const Race = {
  SIZE,
  createGame: (_,first = 0) => ({
    first, turn: first, pawns: [76,4], walls: [], left: [10,10], winner: null, moves: 0,
  }),
  destinations(game) {
    const result = [];
    if (game.winner !== null) return result;
    const pawn = game.pawns[game.turn], opponent = game.pawns[1-game.turn];
    for (const [dx,dy] of DIRECTIONS) {
      const next = neighbor(game.walls,pawn,dx,dy);
      if (next === null) continue;
      if (next !== opponent) result.push(next);
      else {
        const jump = neighbor(game.walls,opponent,dx,dy);
        if (jump !== null) result.push(jump);
        else for (const sign of [-1,1]) {
          const diagonal = neighbor(game.walls,opponent,dy*sign,dx*sign);
          if (diagonal !== null) result.push(diagonal);
        }
      }
    }
    return result;
  },
  move(game,cell) {
    if (!Race.destinations(game).includes(cell)) return game;
    const pawns = game.pawns.slice();
    pawns[game.turn] = cell;
    const winner = coordinates(cell)[1] === goalRow(game.turn) ? game.turn : null;
    return { ...game, pawns, winner, turn: winner ?? 1-game.turn, moves: game.moves+1 };
  },
  wallError(game,{x,y,axis}) {
    if (game.winner !== null || !game.left[game.turn]) return '没有可用的墙';
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= SIZE-1 || y < 0 || y >= SIZE-1 ||
        (axis !== 'h' && axis !== 'v')) return '请点棋盘内的墙缝';
    if (game.walls.some(wall => wall.axis !== axis ? wall.x === x && wall.y === y :
      axis === 'h' ? wall.y === y && Math.abs(wall.x-x) <= 1 : wall.x === x && Math.abs(wall.y-y) <= 1)) {
      return '墙不能重叠或交叉';
    }
    const walls = [...game.walls,{x,y,axis}];
    return game.pawns.every((pawn,seat) => hasPath(walls,pawn,seat)) ? '' : '必须给双方留一条路';
  },
  place(game,wall) {
    if (Race.wallError(game,wall)) return game;
    const left = game.left.slice();
    left[game.turn]--;
    return { ...game, walls: [...game.walls,{...wall}], left, turn: 1-game.turn, moves: game.moves+1 };
  },
};

module.exports = { Connect, Race };
