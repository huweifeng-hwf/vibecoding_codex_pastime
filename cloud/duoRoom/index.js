'use strict';

const { createHash } = require('node:crypto');
const cloud = require('wx-server-sdk');
const { CODE, ACTION, createRoom, snapshot, applyRoom } = require('./room');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
const COLLECTION = 'duo_rooms';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

exports.main = async (event = {}) => {
  const { APPID, OPENID } = cloud.getWXContext();
  if (!APPID || !OPENID) return { error: 'identity' };

  if (event.op === 'probe') {
    await db.collection(COLLECTION).limit(1).get();
    return { ready: true };
  }

  const creating = event.op === 'create';
  if (creating && (typeof event.actionId !== 'string' || !ACTION.test(event.actionId))) return { error: 'invalid' };
  const code = creating
    ? hash([APPID, OPENID, event.actionId]).slice(0, 10).toUpperCase()
    : event.code;
  if (typeof code !== 'string' || !CODE.test(code)) return { error: 'badCode' };

  return db.runTransaction(async transaction => {
    const doc = transaction.collection(COLLECTION).doc(`${APPID}-${code}`);
    const { data } = await doc.get();
    const now = Date.now();
    if (creating || event.op === 'join') {
      const limiter = transaction.collection(COLLECTION).doc(`limit-${hash([APPID, OPENID]).slice(0, 24)}`);
      const { data: attempts } = await limiter.get();
      const recent = (attempts?.recent || []).filter(time => now - time < 60_000);
      if (recent.length >= 12) return { error: 'rateLimit' };
      await limiter.set({ data: { recent: [...recent, now], expiresAt: now + 60_000 } });
    }
    if (!data) {
      if (!creating) return { error: 'missing' };
      const room = createRoom(code, OPENID, now);
      await doc.set({ data: room });
      return { room: snapshot(room, 0, now) };
    }
    const { _id, ...room } = data;
    if (creating && room.members[0].player !== OPENID) return { error: 'collision' };
    const { reply, changed } = applyRoom(room, OPENID, creating ? { op: 'sync' } : event, now);
    if (changed) await doc.set({ data: room });
    return reply;
  });
};
