/* Illustrative external task performance inputs; not measured equipment data. */
(function (root) {
  "use strict";
  function createSimulationSample() {
    const M = typeof module !== "undefined" && module.exports ? require("./model.js") : root.ME;
    const d = {
      version: 2, title: "Simulation — 弾道ミサイルの二段階迎撃", time: {unit:"seconds",duration:180,snap:1},
      actors: [
        {id:"missile",name:"弾道ミサイル本体",side:"hostile",color:"#a75353",notes:"敵Actorはこの1件のみ。撃破作用を受けると敵側の撃破Stateへ分岐し、後続飛行を中止する。飛行線は未迎撃時の基準経路。時刻は説明用の仮定で、軌道計算は行わない。"},
        {id:"radar",name:"広域レーダー",side:"friendly",color:"#236d78"},
        {id:"control",name:"中央管制",side:"friendly",color:"#8061a8"},
        {id:"midcourse",name:"中間軌道撃破用ユニット",side:"friendly",color:"#397aa0"},
        {id:"terminal",name:"終末軌道撃破用ユニット",side:"friendly",color:"#538447"},
      ],
      states: [
        {id:"missile-launched",actorId:"missile",name:"発射",time:0},
        {id:"missile-midcourse",actorId:"missile",name:"中間軌道突入",time:60},
        {id:"missile-terminal",actorId:"missile",name:"終末軌道突入",time:120},
        {id:"missile-impact",actorId:"missile",name:"未迎撃なら着弾",time:180,notes:"基準飛行の終点。撃破された試行では到達しない。"},
        {id:"missile-destroyed-mid",actorId:"missile",name:"中間軌道で撃破",time:100},
        {id:"missile-destroyed-terminal",actorId:"missile",name:"終末軌道で撃破",time:160},
        {id:"radar-ready",actorId:"radar",name:"広域監視",time:0},
        {id:"radar-detected",actorId:"radar",name:"目標探知",time:20},
        {id:"radar-track",actorId:"radar",name:"追尾確立",time:30,simulation:{w:.25},notes:"外部解析による抽象的な性能劣化度w=0.25。原因をIMEEでは計算しない。"},
        {id:"control-ready",actorId:"control",name:"管制待機",time:0},
        {id:"control-decision",actorId:"control",name:"迎撃判断",time:40,phase:"decision"},
        {id:"control-orders",actorId:"control",name:"指令発出",time:50},
        {id:"midcourse-standby",actorId:"midcourse",name:"待機",time:0},
        {id:"midcourse-ready",actorId:"midcourse",name:"中間迎撃準備完了",time:60},
        {id:"midcourse-launched",actorId:"midcourse",name:"迎撃ミサイル発射",time:70},
        {id:"midcourse-kill",actorId:"midcourse",name:"迎撃",time:100,notes:"迎撃CDFの達成結果。敵ミサイルの撃破までを含む作用が成立した時点を表す。"},
        {id:"terminal-standby",actorId:"terminal",name:"待機",time:0},
        {id:"terminal-ready",actorId:"terminal",name:"終末迎撃準備完了",time:120},
        {id:"terminal-launched",actorId:"terminal",name:"迎撃ミサイル発射",time:130},
        {id:"terminal-kill",actorId:"terminal",name:"迎撃",time:160,notes:"迎撃CDFの達成結果。敵ミサイルの撃破までを含む作用が成立した時点を表す。"},
      ],
      tasks: [
        {id:"boost-flight",fromStateId:"missile-launched",toStateId:"missile-midcourse",label:"上昇飛行（基準）",kind:"flight"},
        {id:"midcourse-flight",fromStateId:"missile-midcourse",toStateId:"missile-terminal",label:"中間軌道飛行（基準）",kind:"flight",junctions:[{id:"mid-effect-junction",time:100,simulation:{mode:"effect"},outcomes:[{label:"撃破",toStateId:"missile-destroyed-mid",delay:0}]}]},
        {id:"terminal-flight",fromStateId:"missile-terminal",toStateId:"missile-impact",label:"終末軌道飛行（基準）",kind:"flight",junctions:[{id:"terminal-effect-junction",time:160,simulation:{mode:"effect"},outcomes:[{label:"撃破",toStateId:"missile-destroyed-terminal",delay:0}]}]},
        {id:"detect",fromStateId:"radar-ready",toStateId:"radar-detected",label:"探知",kind:"detection",notes:"説明用の仮定。探知の未達確率2%。実在レーダーの性能ではない。",
          simulation:{enabled:true,w:0,waitForStateIds:["missile-launched"],performanceModel:{type:"cdf",degradationInput:"w",curves:[
            {w:0,points:[{t:5,p:.1},{t:15,p:.6},{t:30,p:.9},{t:40,p:.98}],pInfinity:.02},
            {w:1,points:[{t:5,p:.02},{t:15,p:.2},{t:30,p:.6},{t:40,p:.85}],pInfinity:.15},
          ]}}},
        {id:"track",fromStateId:"radar-detected",toStateId:"radar-track",label:"追尾",kind:"information"},
        {id:"decide",fromStateId:"control-ready",toStateId:"control-decision",label:"脅威評価・迎撃判断",
          simulation:{enabled:true,w:0,waitForStateIds:["radar-track"],wInput:{waitForLinks:true},performanceModel:{type:"cdf",curves:[
            {w:0,points:[{t:3,p:.3},{t:8,p:.85},{t:15,p:1}],pInfinity:0},
            {w:1,points:[{t:3,p:.3},{t:8,p:.85},{t:15,p:1}],pInfinity:0},
          ]}}},
        {id:"command",fromStateId:"control-decision",toStateId:"control-orders",label:"指令伝達",kind:"command",simulation:{enabled:false,wInput:{stateIds:["control-decision"]}}},
        {id:"midcourse-prepare",fromStateId:"midcourse-standby",toStateId:"midcourse-ready",label:"中間迎撃準備・待機"},
        {id:"midcourse-launch",fromStateId:"midcourse-ready",toStateId:"midcourse-launched",label:"発射指示",kind:"command",
          simulation:{enabled:false,waitForStateIds:["control-orders","missile-midcourse"],wInput:{waitForLinks:true}},notes:"指令・飛行段階への到達・準備完了を待ち、説明用の固定10秒で発射する。入力wを発射Stateへ引き継ぐ。"},
        {id:"midcourse-intercept",fromStateId:"midcourse-launched",toStateId:"midcourse-kill",label:"中間軌道迎撃",kind:"attack",
          simulation:{enabled:true,w:0,wInput:{stateIds:["midcourse-launched"]},performanceModel:{type:"cdf",curves:[
            {w:0,points:[{t:10,p:.3},{t:20,p:.65},{t:30,p:.8}],pInfinity:.2},
            {w:1,points:[{t:10,p:.1},{t:20,p:.35},{t:30,p:.55}],pInfinity:.45},
          ]}},notes:"発射から敵ミサイルの撃破達成までの時間CDF。飛翔や交戦の詳細は外部性能に縮約する。w=0時の未達確率20%。"},
        {id:"terminal-prepare",fromStateId:"terminal-standby",toStateId:"terminal-ready",label:"終末迎撃準備・待機",simulation:{enabled:false,cancelOnStateIds:["missile-destroyed-mid"]}},
        {id:"terminal-launch",fromStateId:"terminal-ready",toStateId:"terminal-launched",label:"発射指示",kind:"command",
          simulation:{enabled:false,waitForStateIds:["control-orders","missile-terminal"],wInput:{waitForLinks:true},cancelOnStateIds:["missile-destroyed-mid"]},notes:"指令・終末軌道への到達・準備完了を待ち、説明用の固定10秒で発射する。中間撃破時は中止する。"},
        {id:"terminal-intercept",fromStateId:"terminal-launched",toStateId:"terminal-kill",label:"終末軌道迎撃",kind:"attack",
          simulation:{enabled:true,w:0,wInput:{stateIds:["terminal-launched"]},cancelOnStateIds:["missile-destroyed-mid"],performanceModel:{type:"cdf",curves:[
            {w:0,points:[{t:5,p:.25},{t:15,p:.6},{t:30,p:.85}],pInfinity:.15},
            {w:1,points:[{t:5,p:.1},{t:15,p:.35},{t:30,p:.6}],pInfinity:.4},
          ]}},notes:"発射から敵ミサイルの撃破達成までの時間CDF。中間撃破時は実行しない。w=0時の未達確率15%。"},
      ],
      causalLinks: [
        {id:"missile-observation",source:{type:"state",id:"missile-launched"},target:{type:"task",id:"detect",time:10},polarity:"positive",label:"目標の出現",kind:"observation"},
        {id:"track-information",source:{type:"state",id:"radar-track"},target:{type:"task",id:"decide",time:30},polarity:"positive",label:"追尾情報",kind:"information",simulation:{enabled:true,type:"w",delay:0}},
        {id:"midcourse-command",source:{type:"state",id:"control-orders"},target:{type:"task",id:"midcourse-launch",time:60},polarity:"positive",label:"中間迎撃指令",kind:"command",simulation:{enabled:true,type:"w",delay:0}},
        {id:"terminal-command",source:{type:"state",id:"control-orders"},target:{type:"task",id:"terminal-launch",time:120},polarity:"positive",label:"終末迎撃指令",kind:"command",simulation:{enabled:true,type:"w",delay:0}},
        {id:"midcourse-effect",source:{type:"state",id:"midcourse-kill"},target:{type:"task",id:"midcourse-flight",time:100},polarity:"negative",label:"中間撃破作用",kind:"attack",simulation:{enabled:true,type:"branch",delay:0,junctionId:"mid-effect-junction",outcomeStateId:"missile-destroyed-mid",stopTargetActor:true}},
        {id:"terminal-effect",source:{type:"state",id:"terminal-kill"},target:{type:"task",id:"terminal-flight",time:160},polarity:"negative",label:"終末撃破作用",kind:"attack",simulation:{enabled:true,type:"branch",delay:0,junctionId:"terminal-effect-junction",outcomeStateId:"missile-destroyed-terminal",stopTargetActor:true}},
      ],
      simulation:{successStateIds:["missile-destroyed-mid","missile-destroyed-terminal"],successMode:"any",deadline:180,iterations:5000,seed:17},
    };
    return M.defaults(M.validate(d));
  }
  root.createSimulationSample=createSimulationSample;
  if(typeof module!=="undefined" && module.exports) module.exports=createSimulationSample;
})(globalThis);
