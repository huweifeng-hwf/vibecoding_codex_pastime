'use strict';
const { start } = require('./app');
const canvas = wx.createCanvas();
const info = wx.getWindowInfo();
let pending = false;
start({ canvas, safeTop: (info.safeArea && info.safeArea.top) || 30,
  size: () => { const i=wx.getWindowInfo(); return {width:i.windowWidth,height:i.windowHeight,dpr:i.pixelRatio}; },
  storage: { get: key => wx.getStorageSync(key), set: (key,value) => wx.setStorageSync(key,value) },
  onTap: handler => { wx.onTouchStart(event => { if(pending || event.touches.length !== 1)return; const t=event.touches[0]; handler(t.clientX,t.clientY); }); },
  onResize: handler => wx.onWindowResize(handler),
  confirm: (message,yes) => { pending=true;wx.showModal({title:'确认操作',content:message,success:r=>{if(r.confirm)yes();},complete:()=>{pending=false;}}); }
});
