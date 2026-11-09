'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { start } = require('../src/app');
const { createOnline } = require('../src/online');

function backend() {
  const rows = new Map();
  let identity, now = 100_000, queue = Promise.resolve();
  const module = { exports: {} };
  const transaction = {
    collection: () => ({
      doc: key => ({
        get: async () => ({ data: rows.has(key) ? structuredClone(rows.get(key)) : null }),
        set: async ({ data }) => { rows.set(key, structuredClone(data)); },
      }),
    }),
  };
  const sdk = {
    init() {},
    getWXContext: () => ({ APPID: 'test-app', OPENID: identity }),
    database: () => ({
      collection: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
      runTransaction(fn) {
        const result = queue.then(() => fn(transaction));
        queue = result.catch(() => {});
        return result;
      },
    }),
  };
  const source = fs.readFileSync(require.resolve('../cloud/duoRoom/index'),'utf8');
  const logic = fs.readFileSync(require.resolve('../cloud/duoRoom/room'),'utf8');
  const rules = { exports: {} };
  vm.runInNewContext(logic, {
    require: () => require('../src/game'), module: rules,
  });
  vm.runInNewContext(source, {
    require: name => name === 'wx-server-sdk' ? sdk : name === './room' ? rules.exports : require(name),
    exports: module.exports, Date: { now: () => now },
  });
  return {
    tick: ms => { now += ms; },
    call: (who, request) => {
      identity = who;
      return module.exports.main(request).then(value => JSON.parse(JSON.stringify(value)));
    },
  };
}

function storageAdapter(map) {
  return { get: key => map.get(key), set: (key,value) => map.set(key,value) };
}

test('两个联机客户端建房、准备、断线后重发、结算和换先手再战', async t => {
  const server = backend();
  const aStorage = new Map();
  const bStorage = new Map();
  let dropResponse = false;
  const callA = async request => {
    const result = await server.call('a',request);
    if (request.op === 'move' && dropResponse) { dropResponse = false; throw new Error('lost response'); }
    return result;
  };
  const a = createOnline(callA,storageAdapter(aStorage),() => {});
  const b = createOnline(request => server.call('b',request),storageAdapter(bStorage),() => {});
  t.after(() => { a.close(); b.close(); });
  a.open();
  b.open();
  await a.action('probe');
  assert.match(a.state().message,/云数据库连接正常/);
  await a.action('create');
  const code = a.state().code;
  assert.match(code,/^[A-F0-9]{10}$/);
  await b.action('join',{code});
  assert.equal(b.state().room.seat,'O');
  assert.equal((await server.call('outsider',{op:'sync',code})).error,'notMember');
  assert.equal((await server.call('outsider',{op:'join',code})).error,'unavailable');
  await a.action('start');
  assert.match(a.state().message,/需要两位玩家/);
  await Promise.all([a.action('ready'), b.action('ready')]);
  await a.action('start');
  await b.visibility(true);
  assert.equal(b.state().room.game.turn,'X');

  dropResponse = true;
  await a.action('move',{index:0});
  assert.match(a.state().message,/正在重连/);
  a.visibility(false);
  server.tick(30_000);
  await a.visibility(true);
  assert.equal(a.state().room.game.moves,1);
  await b.visibility(true);
  for (const [client, other, index] of [[b,a,3],[a,b,1],[b,a,4],[a,b,2]]) {
    await client.action('move',{index});
    await other.visibility(true);
  }
  assert.deepEqual(a.state().room.game,b.state().room.game);
  assert.equal(a.state().room.status,'finished');
  assert.equal(a.state().room.game.winner,'X');

  const restored = createOnline(request => server.call('b',request),storageAdapter(bStorage),() => {});
  b.close();
  t.after(() => restored.close());
  await restored.open();
  assert.equal(restored.state().room.seat,'O');
  await Promise.all([a.action('rematch'),restored.action('rematch')]);
  await a.visibility(true);
  assert.equal(a.state().room.round,2);
  assert.equal(a.state().room.game.turn,'O');
  assert.equal(a.state().room.game.moves,0);

  server.tick(60_000);
  await a.visibility(true);
  assert.equal(a.state().room.status,'interrupted');
  assert.equal(a.state().room.game.winner,null);
  await a.action('leave');
  assert.equal(a.state().code,null);
});

test('云函数拒绝冒用座位、旧版本、重复建房和并发抢座', async () => {
  const server = backend();
  const create = {op:'create',actionId:'create-123'};
  const { room: initial } = await server.call('host',create);
  const { code } = initial;
  assert.equal((await server.call('host',create)).room.code,code);
  const joined = await Promise.all([
    server.call('guest',{op:'join',code}),
    server.call('other',{op:'join',code}),
  ]);
  assert.equal(joined.filter(result => result.room).length,1);
  const guest = joined[0].room ? 'guest' : 'other';
  await server.call('host',{op:'ready',code,round:0});
  await server.call(guest,{op:'ready',code,round:0});
  const { room } = await server.call('host',{op:'start',code,round:0});
  const move = {op:'move',code,round:1,revision:room.revision,index:0,actionId:'move-0001',seat:'X'};
  assert.equal((await server.call(guest,move)).error,'notTurn');
  const accepted = await server.call('host',move);
  assert.equal(accepted.room.game.moves,1);
  assert.equal((await server.call('host',move)).room.revision,accepted.room.revision);
  assert.equal((await server.call(guest,{...move,actionId:'move-0002'})).error,'stale');
  assert.equal((await server.call('host',{...move,round:0})).error,'stale');
  assert.equal(JSON.stringify(accepted).includes('"player"'),false);
});

test('小游戏画布可输入房间码并提交联机落子，且不写本机战绩', async t => {
  const server = backend();
  const { room } = await server.call('host',{op:'create',actionId:'create-ui-1'});
  const { code } = room;
  const storage = new Map();
  let labels = new Map(), tap, visibility;
  let currentCall;
  start({
    canvas: { getContext: () => ({
      fillRect() {}, setTransform() {},
      fillText(label,x,y) { labels.set(label,[x,y]); },
    }) },
    size: () => ({width:320,height:650,dpr:2,safeBottom:34}),
    storage: storageAdapter(storage),
    onTap: fn => { tap = fn; },
    onResize() {},
    onVisibility: fn => { visibility = fn; },
    confirm: (_,yes) => yes(),
    roomCall: request => {
      currentCall = server.call('guest',request);
      return currentCall;
    },
  });
  t.after(() => visibility(false));
  function press(label) {
    assert.ok(labels.has(label), `找不到 ${label}`);
    const position = labels.get(label);
    labels = new Map();
    tap(...position);
    return currentCall;
  }
  press('井字棋 · 好友联机');
  press('输入房间码');
  for (const digit of code) press(digit);
  await press('加入房间');
  assert.ok(labels.has(`房间码 ${code} · 你是 O`));
  await press('准备');
  await server.call('host',{op:'ready',code,round:0});
  const { room: started } = await server.call('host',{op:'start',code,round:0});
  await server.call('host',{op:'move',code,round:1,revision:started.revision,index:0,actionId:'host-move-1'});
  await visibility(true);
  assert.ok(labels.has('轮到你落子'));
  tap(160,231);
  await currentCall;
  assert.ok(labels.has('○'));
  assert.deepEqual([...storage.keys()],['duo.online.room.v1']);
});
