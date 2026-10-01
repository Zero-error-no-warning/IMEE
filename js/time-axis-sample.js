(function(root){
  "use strict";
  const M=typeof module!=="undefined"&&module.exports?require("./model.js"):root.ME;
  function createTimeAxisSample(){
    return M.defaults(M.validate({version:3,title:"共通時間軸 — 探知・伝達・H+30判断",time:{unit:"minutes",duration:40,snap:1},
      actors:[{id:"sensor",name:"センサー",side:"friendly",color:"#236d78"},{id:"control",name:"管制",side:"friendly",color:"#8061a8"}],
      states:[{id:"start",actorId:"sensor",name:"捜索開始",time:0,timing:{mode:"fixed",at:0},simulation:{q:.8}},
        {id:"detected",actorId:"sensor",name:"探知成立",time:14,timing:{mode:"relative"}},
        {id:"received",actorId:"control",name:"探知情報を受領",time:18,timing:{mode:"relative"}},
        {id:"decision",actorId:"control",name:"指定時刻の判断",time:30,timing:{mode:"fixed",at:30}}],
      tasks:[{id:"search",label:"捜索",fromStateId:"start",toStateId:"detected",timing:{duration:14},simulation:{enabled:true,performanceModel:{type:"cdf",qualityInput:"q",curves:[
        {q:0,points:[{t:8,p:.05,q:1},{t:20,p:.4,q:.9},{t:30,p:.6,q:.8}]},
        {q:1,points:[{t:6,p:.15,q:1},{t:14,p:.7,q:.9},{t:22,p:.95,q:.8}]}]}}},
        {id:"assess",label:"判断準備（6分）",fromStateId:"received",toStateId:"decision",timing:{duration:6},simulation:{enabled:false,qualityRetention:1}}],
      causalLinks:[{id:"report",label:"探知情報の伝達",source:{type:"state",id:"detected"},target:{type:"state",id:"received"},propagation:{duration:4,performanceModel:{type:"cdf",curves:[{q:1,points:[{t:1,p:.1,q:1},{t:4,p:.8,q:1},{t:10,p:.95,q:1}]}]}},simulation:{enabled:true}}],
      technologies:[],bindings:[],views:{main:{cdfMode:"config",cdfScope:"all",cdfQ:1}},
      simulation:{successStateIds:["decision"],iterations:1000,seed:17,deadline:30,successMode:"all"},
      notes:"横方向は全Actor共通の経過時間。設定CDFは所要時間、結果CDFは実際の絶対時刻。H+30までに準備ができた試行だけ指定時刻に判断が成立する。"}));
  }
  if(typeof module!=="undefined"&&module.exports)module.exports=createTimeAxisSample;else root.createTimeAxisSample=createTimeAxisSample;
})(globalThis);
