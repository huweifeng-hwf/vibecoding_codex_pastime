'use strict';

const ROOM_KEY = 'duo.online.room.v1';
const POLL_MS = 1500;

function createOnline(call, storage, render) {
  let code = null;
  try {
    const saved = storage.get(ROOM_KEY);
    if (typeof saved === 'string' && /^[A-F0-9]{10}$/.test(saved)) code = saved;
  } catch {}
  let room = null;
  let active = false, visible = true, inFlight = null, timer, pending = null;
  let message = '';
  let sequence = 0;

  function remember(nextCode) {
    if (code === nextCode) return;
    code = nextCode;
    try { storage.set(ROOM_KEY, nextCode || ''); } catch {}
  }

  function schedule() {
    clearTimeout(timer);
    if (active && visible && code) {
      timer = setTimeout(() => send(pending || { op: 'sync', code }), POLL_MS);
    }
  }

  async function send(request) {
    if (!active || !visible || inFlight) return;
    clearTimeout(timer);
    inFlight = request;
    if (request.op !== 'sync') {
      pending = request;
      message = '';
      render();
    }
    try {
      const response = await call(request);
      if (pending === request) pending = null;
      if (response.room) {
        room = response.room;
        remember(room.code);
      }
      if (['missing', 'notMember', 'closed'].includes(response.error) && request.code === code) {
        remember(null);
        if (!response.room) room = null;
      }
      if (request.op === 'leave' && !response.error) {
        room = null;
        remember(null);
      }
      message = {
        badCode: '请输入有效的房间码', missing: '房间不存在或已关闭',
        notMember: '你已不在这个房间', unavailable: '房间已满或已开局',
        closed: '房间已关闭', stale: '已同步最新状态，请重试',
        notReady: '需要两位玩家在线并准备', notTurn: '还没轮到你',
        identity: '微信身份验证失败', invalid: '当前操作不可用',
        collision: '房间码冲突，请重新建房', rateLimit: '操作过于频繁，请稍后再试',
      }[response.error] || '';
      if (response.ready) message = '微信身份与云数据库连接正常';
    } catch {
      message = code ? '连接中断，正在重连…' : '云服务暂不可用，请检查环境后重试';
    } finally {
      inFlight = null;
      if (active) render();
      if (request.op === 'sync' && pending && active && visible) void send(pending);
      else schedule();
    }
  }

  return {
    state: () => ({
      code, room, message, retry: !code && Boolean(pending) && !inFlight,
      busy: Boolean(inFlight && (inFlight.op !== 'sync' || !room)),
    }),
    open() {
      active = true;
      message = '';
      if (code) return send(pending || { op: 'sync', code });
    },
    close() {
      active = false;
      if (!code) pending = null;
      clearTimeout(timer);
    },
    visibility(value) {
      visible = value;
      if (!value) clearTimeout(timer);
      else if (active && code) return send(pending || { op: 'sync', code });
    },
    action(op, values = {}) {
      const request = { op, ...(code ? { code } : {}),
        ...(room ? { round: room.round, revision: room.revision } : {}), ...values };
      if (op === 'create' || op === 'move') {
        request.actionId = `${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2)}`;
      }
      // A failed request may already have committed. Replay it before accepting another action.
      if (inFlight?.op === 'sync' && !pending) {
        pending = request;
        return;
      }
      return send(pending || request);
    },
  };
}

module.exports = { createOnline };
