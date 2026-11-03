const { start } = require('./app');
const canvas=document.getElementById('game');
start({canvas,storage:{get:k=>localStorage.getItem(k),set:(k,v)=>localStorage.setItem(k,v)},
  size:()=>({width:canvas.clientWidth,height:canvas.clientHeight,dpr:devicePixelRatio}),
  onTap:fn=>canvas.addEventListener('pointerdown',e=>{if(!e.isPrimary)return;const r=canvas.getBoundingClientRect();fn(e.clientX-r.left,e.clientY-r.top);}),
  onResize:fn=>window.addEventListener('resize',fn),confirm:(message,yes)=>{if(window.confirm(message))yes();}});
