'use strict';

const { createGame, play } = require('./game');

const GRACE = 60_000;
const IDLE = 600_000;
const HEARTBEAT = 10_000;
const SEATS = ['X', 'O'];
const CODE = /^[A-F0-9]{10}$/;
const ACTION = /^[a-z0-9-]{8,80}$/;

function createRoom(code, player, now) {
  return {
    code, members: [{ player, seenAt: now, ready: false }],
    status: 'waiting', board: null, round: 0, revision: 0, expiresAt: now + IDLE,
  };
}

function snapshot(room, seat, now) {
  return {
    code: room.code, seat: SEATS[seat], status: room.status, round: room.round,
    revision: room.revision, game: room.board,
    seats: room.members.map(member => ({ ready: member.ready, online: now - member.seenAt < HEARTBEAT * 2 })),
  };
}

function begin(room, now) {
  room.round++;
  room.board = createGame(room.round % 2 ? 'X' : 'O');
  room.status = 'playing';
  room.members.forEach(member => { member.ready = false; member.seenAt = now; member.lastMove = null; });
}

function applyRoom(room, player, request, now) {
  let seat = room.members.findIndex(member => member.player === player);
  if (seat < 0) {
    if (request.op !== 'join') return { reply: { error: 'notMember' }, changed: false };
    if (room.status !== 'waiting' || room.members.length === 2 || now >= room.expiresAt) {
      return { reply: { error: 'unavailable' }, changed: false };
    }
  }

  let changed = false;
  const update = () => { changed = true; };
  const revise = () => { room.revision++; update(); };
  const reply = (error, includeRoom = seat >= 0) => ({
    changed,
    reply: { ...(error ? { error } : {}), ...(includeRoom ? { room: snapshot(room, seat, now) } : {}) },
  });

  if (room.status === 'playing' && room.members.some(member => now - member.seenAt >= GRACE)) {
    room.status = 'interrupted';
    room.expiresAt = now + IDLE;
    revise();
  }
  if (room.status !== 'playing' && now >= room.expiresAt && room.status !== 'closed') {
    room.status = 'closed';
    revise();
  }
  if (room.status === 'closed') return reply('closed');

  if (request.op === 'join' && seat < 0) {
    seat = room.members.length;
    room.members.push({ player, seenAt: now, ready: false });
    revise();
  }
  const member = room.members[seat];
  if (now - member.seenAt >= HEARTBEAT) { member.seenAt = now; update(); }

  switch (request.op) {
    case 'join':
    case 'sync':
      return reply();
    case 'ready':
    case 'rematch': {
      const expected = request.op === 'ready' ? 'waiting' : 'finished';
      if (room.status !== expected || request.round !== room.round) return reply('stale');
      if (!member.ready) { member.ready = true; revise(); }
      if (expected === 'finished' && room.members.every(entry => entry.ready)) { begin(room, now); revise(); }
      return reply();
    }
    case 'start':
      if (room.status === 'playing' && room.round === 1 && request.round === 0 && seat === 0) return reply();
      if (seat !== 0 || room.status !== 'waiting' || room.members.length !== 2 ||
          !room.members.every(entry => entry.ready && now - entry.seenAt < HEARTBEAT * 2)) return reply('notReady');
      begin(room, now);
      revise();
      return reply();
    case 'move': {
      if (typeof request.actionId !== 'string' || !ACTION.test(request.actionId)) return reply('invalid');
      if (member.lastMove === request.actionId && request.round === room.round) return reply();
      if (room.status !== 'playing' || request.round !== room.round || request.revision !== room.revision) return reply('stale');
      if (room.board.turn !== SEATS[seat]) return reply('notTurn');
      const next = play(room.board, request.index);
      if (next === room.board) return reply('invalid');
      member.lastMove = request.actionId;
      room.board = next;
      if (next.winner || next.draw) {
        room.status = 'finished';
        room.expiresAt = now + IDLE;
      }
      revise();
      return reply();
    }
    case 'leave':
      if (room.status === 'waiting' && seat === 1) {
        room.members.pop();
        room.members[0].ready = false;
      } else {
        room.status = room.status === 'playing' ? 'interrupted' : 'closed';
        room.expiresAt = now + IDLE;
      }
      revise();
      return reply(undefined, false);
    default:
      return reply('invalid');
  }
}

module.exports = { CODE, ACTION, createRoom, snapshot, applyRoom };
