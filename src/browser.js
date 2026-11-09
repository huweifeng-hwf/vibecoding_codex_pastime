const { start } = require('./app');
const canvas=document.getElementById('game');
const storage = window.DuoRecords ?? localStorage;
start({canvas,storage:{
  get: key => storage.getItem(key),
  set: (key,value) => {
    if (storage.setItem(key,value) === false) throw new Error('Unable to save local records');
  },
},
  size:()=>({width:canvas.clientWidth,height:canvas.clientHeight,dpr:devicePixelRatio}),
  onTap:fn=>canvas.addEventListener('pointerdown',e=>{if(!e.isPrimary)return;const r=canvas.getBoundingClientRect();fn(e.clientX-r.left,e.clientY-r.top);}),
  onPointer: fn => {
    for (const type of ['down','move','up','cancel']) canvas.addEventListener('pointer'+type,event => {
      if (type === 'down' && event.isTrusted) canvas.setPointerCapture(event.pointerId);
      const rect = canvas.getBoundingClientRect();
      fn(type,event.pointerId,event.clientX-rect.left,event.clientY-rect.top);
    });
    canvas.addEventListener('lostpointercapture',event => fn('cancel',event.pointerId,0,0));
  },
  requestFrame: fn => window.requestAnimationFrame(fn),
  onResize:fn=>new ResizeObserver(fn).observe(canvas),confirm:(message,yes)=>{if(window.confirm(message))yes();},
  prompt: (message, accept) => {
    const value = window.prompt(message);
    if (value !== null) accept(value);
  },
});
