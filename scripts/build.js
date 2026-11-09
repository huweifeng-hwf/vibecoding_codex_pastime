'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const onlineEnv = process.env.DUO_CLOUD_ENV;
if (onlineEnv && !/^[a-zA-Z0-9-]{1,100}$/.test(onlineEnv)) throw new Error('Invalid DUO_CLOUD_ENV');
function bundle(entry){const names=['game','gomoku','memory','flight','records','online','app',entry];return `(function(){const modules={${names.map(n=>`${JSON.stringify('./'+n)}:function(require,module,exports){\n${fs.readFileSync(path.join(root,'src',n+'.js'),'utf8')}\n}`).join(',')}};const cache={};function require(n){if(cache[n])return cache[n].exports;const m={exports:{}};cache[n]=m;modules[n](require,m,m.exports);return m.exports;}require('./${entry}');})();`;}
for(const target of ['web','wechat'])fs.mkdirSync(path.join(root,'dist',target),{recursive:true});
fs.writeFileSync(path.join(root,'dist/web/game.js'),bundle('browser'));
fs.copyFileSync(path.join(root,'web/index.html'),path.join(root,'dist/web/index.html'));
fs.writeFileSync(path.join(root,'dist/wechat/game.js'),bundle('wechat').replace('__DUO_CLOUD_ENV__', () => onlineEnv || '__DUO_CLOUD_ENV__'));
const cloudRoot = path.join(root,'dist/wechat/cloudfunctions/duoRoom');
fs.mkdirSync(cloudRoot, {recursive:true});
for (const file of ['index.js', 'room.js', 'package.json']) {
  fs.copyFileSync(path.join(root,'cloud/duoRoom',file),path.join(cloudRoot,file));
}
fs.copyFileSync(path.join(root,'src/game.js'),path.join(cloudRoot,'game.js'));
fs.writeFileSync(path.join(root,'dist/wechat/game.json'),JSON.stringify({deviceOrientation:'portrait',showStatusBar:false},null,2));
fs.writeFileSync(path.join(root,'dist/wechat/project.config.json'),JSON.stringify({description:'双人互动小游戏大全',appid:process.env.WX_APPID||'touristappid',projectname:'two-player-party',compileType:'game',cloudfunctionRoot:'cloudfunctions/',packOptions:{ignore:[{type:'folder',value:'cloudfunctions'}]},setting:{es6:true,minified:true}},null,2));
console.log('Built dist/web and dist/wechat. AppID:', process.env.WX_APPID?'configured':'tourist placeholder (not publishable)');
