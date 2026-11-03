const {test}=require('node:test');const assert=require('node:assert/strict');
const {createGame,play}=require('../src/game');const R=require('../src/records');
function round(moves,first){return moves.reduce(play,createGame(first));}
test('三条横线、三条竖线、两条斜线均能结算',()=>{
 for(const line of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]){
 const rest=[0,1,2,3,4,5,6,7,8].filter(i=>!line.includes(i));
 const g=round([line[0],rest[0],line[1],rest[1],line[2]]);assert.equal(g.winner,'X');assert.deepEqual(g.line,line);
 }
});
test('重复、越界及结算后落子不改变状态',()=>{let g=play(createGame(),0);for(const i of [0,-1,9,1.5,NaN])assert.equal(play(g,i),g);g=round([0,3,1,4,2]);assert.equal(play(g,8),g);});
test('平局及交换先手',()=>{const g=round([0,1,2,4,3,5,7,6,8]);assert.equal(g.draw,true);assert.equal(g.winner,null);assert.equal(round([0,3,1,4,2],'O').winner,'O');});
test('战绩持久化、最佳步数及损坏恢复',()=>{let data;const store={get:()=>data,set:(k,v)=>data=v};let r=R.empty();r=R.record(r,round([0,3,1,4,2]));assert.equal(r.X.bestMoves,3);assert.equal(r.X.wins,1);assert.equal(R.save(store,r),true);assert.deepEqual(R.load(store),r);data='broken';assert.deepEqual(R.load(store),R.empty());data='{"version":1}';assert.deepEqual(R.load(store),R.empty());assert.equal(R.save({set:()=>{throw Error();}},r),false);assert.equal(R.record(r,createGame()),r);});
test('遍历所有合法终局：胜者存在连线，平局棋盘填满',()=>{let leaves=0;function visit(g){if(g.winner||g.draw){leaves++;if(g.winner)assert.ok(g.line.every(i=>g.board[i]===g.winner));else assert.ok(g.board.every(Boolean));return;}for(let i=0;i<9;i++){const n=play(g,i);if(n!==g)visit(n);}}visit(createGame());assert.equal(leaves,255168);});
