'use strict';
const { Connect, Race } = require('./grid-games');
const { Box, Darts } = require('./score-games');
const { Arena, Pool } = require('./table-games');

module.exports = [
  { id:'connect', title:'重力连四', description:'2 人 · 落子连四', rules:Connect, unit:'手' },
  { id:'race', title:'挡路竞速', description:'2 人 · 走棋或筑墙', rules:Race, unit:'手' },
  { id:'box', title:'掷骰封盒', description:'2–4 人 · 数字配对', rules:Box, unit:'分', variable:true, scored:true },
  { id:'pong', title:'双人 Pong', description:'2 人 · 实时反弹', rules:Arena.pong, unit:'分', scored:true },
  { id:'hockey', title:'空气曲棍球', description:'2 人 · 双触控击球', rules:Arena.hockey, unit:'分', scored:true },
  { id:'darts', title:'飞镖快赛', description:'2–4 人 · 三轮比准', rules:Darts, unit:'分', variable:true, scored:true },
  { id:'pool', title:'八球台球', description:'2 人 · 拖动蓄力', rules:Pool, unit:'杆' },
];
