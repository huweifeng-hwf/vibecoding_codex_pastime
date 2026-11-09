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
  onResize:fn=>new ResizeObserver(fn).observe(canvas),confirm:(message,yes)=>{if(window.confirm(message))yes();},
  prompt: (message, accept) => {
    const value = window.prompt(message);
    if (value !== null) accept(value);
  },
});
