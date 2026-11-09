const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('微信入口：触摸开局、确认取消/同意、战绩存储',()=>{
 let touch,modal,data;const labels=[];const wx={createCanvas:()=>({getContext:()=>({fillRect(){},setTransform(){},fillText(t){labels.push(t);}})}),getWindowInfo:()=>({windowWidth:390,windowHeight:844,pixelRatio:2,safeArea:{top:30}}),getStorageSync:()=>data,setStorageSync:(k,v)=>data=v,onTouchStart:f=>touch=f,onWindowResize(){},showModal:opts=>modal=opts};
 const code=fs.readFileSync(require.resolve('../src/wechat'),'utf8');vm.runInNewContext(code,{wx,require:require('node:module').createRequire(require.resolve('../src/wechat'))});
 const tap=(x,y)=>touch({touches:[{clientX:x,clientY:y}]});tap(195,275);tap(78,228);tap(195,590);assert.ok(modal);modal.success({confirm:false});modal.complete();assert.equal(data,undefined);
 for(const [x,y] of [[78,344],[195,228],[195,344],[312,228]])tap(x,y);assert.equal(JSON.parse(data).X.wins,1);assert.ok(labels.includes('玩家 X 获胜！'));
});
