'use strict';
const { start } = require('./app');
const onlineEnv = '__DUO_CLOUD_ENV__';
let cloudReady;
async function callRoom(request) {
  if (!cloudReady) {
    cloudReady = Promise.resolve().then(() => wx.cloud.init({ env: onlineEnv, traceUser: false }));
    cloudReady.catch(() => { cloudReady = null; });
  }
  await cloudReady;
  const { result } = await wx.cloud.callFunction({ name: 'duoRoom', data: request });
  if (!result || (!result.room && !result.error && !result.ready && request.op !== 'leave')) {
    throw new Error('Invalid room response');
  }
  return result;
}
const canvas = wx.createCanvas();
const info = wx.getWindowInfo();
let pending = false;
start({ canvas, safeTop: (info.safeArea && info.safeArea.top) || 30,
  size: () => { const i=wx.getWindowInfo(); return {width:i.windowWidth,height:i.windowHeight,dpr:i.pixelRatio,
    safeBottom:Math.max(0,i.windowHeight-(i.safeArea?.bottom ?? i.windowHeight))}; },
  storage: { get: key => wx.getStorageSync(key), set: (key,value) => wx.setStorageSync(key,value) },
  onTap: handler => { wx.onTouchStart(event => { if(pending || event.touches.length !== 1)return; const t=event.touches[0]; handler(t.clientX,t.clientY); }); },
  roomCall: onlineEnv !== '__DUO_'+'CLOUD_ENV__' && typeof wx.cloud?.callFunction === 'function' ? callRoom : null,
  onVisibility: handler => { wx.onShow(() => handler(true)); wx.onHide(() => handler(false)); },
  onResize: handler => wx.onWindowResize(handler),
  confirm: (message,yes) => { pending=true;wx.showModal({title:'确认操作',content:message,success:r=>{if(r.confirm)yes();},complete:()=>{pending=false;}}); },
  prompt: (message, accept) => {
    pending = true;
    wx.showModal({
      title: '本机玩家昵称', editable: true, placeholderText: message,
      success: result => { if (result.confirm) accept(result.content ?? ''); },
      complete: () => { pending = false; },
    });
  },
});
