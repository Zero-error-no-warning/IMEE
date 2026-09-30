/* Illustrative external task performance inputs; not measured equipment data. */
(function (root) {
  "use strict";
  function createSimulationSample() {
    const M = typeof module !== "undefined" && module.exports ? require("./model.js") : root.ME;
    const d = {
      version: 2, title: "Simulation — 弾道ミサイルの二段階迎撃", time: {unit:"seconds",duration:180,snap:1},
      actors: [
        {id:"missile",name:"弾道ミサイル本体",side:"hostile",color:"#a75353",notes:"敵Actorはこの1件のみ。飛行線は未迎撃時の基準経路。時刻は説明用の仮定で、軌道計算は行わない。"},
        {id:"radar",name:"広域レーダー",side:"friendly",color:"#236d78"},
        {id:"control",name:"中央管制",side:"friendly",color:"#8061a8"},
        {id:"midcourse",name:"中間軌道撃破用ユニット",side:"friendly",color:"#397aa0"},
        {id:"terminal",name:"終末軌道撃破用ユニット",side:"friendly",color:"#538447"},
      ],
      states: [
        {id:"missile-launched",actorId:"missile",name:"発射",time:0},
        {id:"missile-midcourse",actorId:"missile",name:"中間軌道突入",time:60},
        {id:"missile-terminal",actorId:"missile",name:"終末軌道突入",time:120},
        {id:"missile-impact",actorId:"missile",name:"未迎撃なら着弾",time:180,notes:"基準飛行の終点。Mission成功は迎撃成功StateのORで評価し、このStateを自動取り消す処理は行わない。"},
        {id:"radar-ready",actorId:"radar",name:"広域監視",time:0},
        {id:"radar-detected",actorId:"radar",name:"目標探知",time:20},
        {id:"radar-track",actorId:"radar",name:"追尾確立",time:30},
        {id:"control-ready",actorId:"control",name:"管制待機",time:0},
        {id:"control-decision",actorId:"control",name:"迎撃判断",time:40,phase:"decision"},
        {id:"control-orders",actorId:"control",name:"指令発出",time:50},
        {id:"midcourse-standby",actorId:"midcourse",name:"待機",time:0},
        {id:"midcourse-ready",actorId:"midcourse",name:"中間迎撃準備完了",time:60},
        {id:"midcourse-kill",actorId:"midcourse",name:"中間迎撃成功",time:90},
        {id:"terminal-standby",actorId:"terminal",name:"待機",time:0},
        {id:"terminal-ready",actorId:"terminal",name:"終末迎撃準備完了",time:120},
        {id:"terminal-kill",actorId:"terminal",name:"終末迎撃成功",time:150},
      ],
      tasks: [
        {id:"boost-flight",fromStateId:"missile-launched",toStateId:"missile-midcourse",label:"上昇飛行（基準）",kind:"flight"},
        {id:"midcourse-flight",fromStateId:"missile-midcourse",toStateId:"missile-terminal",label:"中間軌道飛行（基準）",kind:"flight"},
        {id:"terminal-flight",fromStateId:"missile-terminal",toStateId:"missile-impact",label:"終末軌道飛行（基準）",kind:"flight"},
        {id:"detect",fromStateId:"radar-ready",toStateId:"radar-detected",label:"探知",kind:"detection",notes:"説明用の仮定。探知の未達確率2%。実在レーダーの性能ではない。",
          simulation:{enabled:true,w:0,waitForStateIds:["missile-launched"],performanceModel:{type:"cdf",degradationInput:"w",curves:[
            {w:0,points:[{t:5,p:.1},{t:15,p:.6},{t:30,p:.9},{t:40,p:.98}],pInfinity:.02},
            {w:1,points:[{t:5,p:.02},{t:15,p:.2},{t:30,p:.6},{t:40,p:.85}],pInfinity:.15},
          ]}}},
        {id:"track",fromStateId:"radar-detected",toStateId:"radar-track",label:"追尾",kind:"information"},
        {id:"decide",fromStateId:"control-ready",toStateId:"control-decision",label:"脅威評価・迎撃判断",
          simulation:{enabled:true,w:0,waitForStateIds:["radar-track"],performanceModel:{type:"cdf",curves:[
            {w:0,points:[{t:3,p:.3},{t:8,p:.85},{t:15,p:1}],pInfinity:0},
          ]}}},
        {id:"command",fromStateId:"control-decision",toStateId:"control-orders",label:"指令伝達",kind:"command"},
        {id:"midcourse-prepare",fromStateId:"midcourse-standby",toStateId:"midcourse-ready",label:"中間迎撃準備・待機"},
        {id:"midcourse-intercept",fromStateId:"midcourse-ready",toStateId:"midcourse-kill",label:"中間軌道迎撃",kind:"attack",
          simulation:{enabled:true,w:0,waitForStateIds:["control-orders","missile-midcourse"],performanceModel:{type:"cdf",curves:[
            {w:0,points:[{t:10,p:.3},{t:20,p:.65},{t:30,p:.8}],pInfinity:.2},
            {w:1,points:[{t:10,p:.1},{t:20,p:.35},{t:30,p:.55}],pInfinity:.45},
          ]}},notes:"管制指令・中間軌道への突入・準備完了を待つ。説明用の撃破達成CDF。未達確率20%。"},
        {id:"terminal-prepare",fromStateId:"terminal-standby",toStateId:"terminal-ready",label:"終末迎撃準備・待機"},
        {id:"terminal-intercept",fromStateId:"terminal-ready",toStateId:"terminal-kill",label:"終末軌道迎撃",kind:"attack",
          simulation:{enabled:true,w:0,waitForStateIds:["control-orders","missile-terminal"],performanceModel:{type:"cdf",curves:[
            {w:0,points:[{t:5,p:.25},{t:15,p:.6},{t:30,p:.85}],pInfinity:.15},
            {w:1,points:[{t:5,p:.1},{t:15,p:.35},{t:30,p:.6}],pInfinity:.4},
          ]}},notes:"中間迎撃の成否に依存せず終末迎撃の機会を評価する。中間迎撃成功時の取消は未実装。説明用の未達確率15%。"},
      ],
      causalLinks: [
        {id:"missile-observation",source:{type:"state",id:"missile-launched"},target:{type:"task",id:"detect",time:10},polarity:"positive",label:"目標の出現",kind:"observation"},
        {id:"track-information",source:{type:"state",id:"radar-track"},target:{type:"task",id:"decide",time:30},polarity:"positive",label:"追尾情報",kind:"information"},
        {id:"midcourse-command",source:{type:"state",id:"control-orders"},target:{type:"task",id:"midcourse-intercept",time:60},polarity:"positive",label:"中間迎撃指令",kind:"command"},
        {id:"terminal-command",source:{type:"state",id:"control-orders"},target:{type:"task",id:"terminal-intercept",time:120},polarity:"positive",label:"終末迎撃指令",kind:"command"},
        {id:"midcourse-effect",source:{type:"state",id:"midcourse-kill"},target:{type:"task",id:"midcourse-flight",time:90},polarity:"negative",label:"中間撃破作用",kind:"attack"},
        {id:"terminal-effect",source:{type:"state",id:"terminal-kill"},target:{type:"task",id:"terminal-flight",time:150},polarity:"negative",label:"終末撃破作用",kind:"attack"},
      ],
      simulation:{successStateIds:["midcourse-kill","terminal-kill"],successMode:"any",deadline:180,iterations:5000,seed:17},
    };
    return M.defaults(M.validate(d));
  }
  root.createSimulationSample=createSimulationSample;
  if(typeof module!=="undefined" && module.exports) module.exports=createSimulationSample;
})(globalThis);
