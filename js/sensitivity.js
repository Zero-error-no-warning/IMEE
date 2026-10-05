/* Paired interventions on task performance, never a physical engagement model. */
(function(root){
  "use strict";
  const S=typeof module!=="undefined"&&module.exports ? require("./simulation.js") : root.MESimulation;
  const P=typeof module!=="undefined"&&module.exports ? require("./performance.js") : root.MEPerformance;
  const fail=message=>{throw new Error(message);};
  function requirement(points,target,criterion="lower95") {
    const pass=p=>(criterion==="lower95"?p.interval95.low:p.probability)>=target;
    const ranges=[];let start=null;
    for(let i=0;i<points.length;i++){if(pass(points[i]) && start===null)start=points[i].value;if(start!==null && (!pass(points[i]) || i===points.length-1)){ranges.push({min:start,max:pass(points[i])?points[i].value:points[i-1].value});start=null;}}
    if(arguments[3]==="increasing") {
      const firstPass=points.findIndex(pass);
      if(firstPass<0)return {status:"no-passing-sample",ranges,minPassingValue:null,lastFailingValue:points.at(-1).value};
      if(points.slice(firstPass).some(p=>!pass(p)))return {status:"nonmonotone",ranges,minPassingValue:null,lastFailingValue:null};
      return {status:firstPass===0?"all-tested-pass":"bracketed",ranges,minPassingValue:points[firstPass].value,lastFailingValue:firstPass?points[firstPass-1].value:null};
    }
    const firstFail=points.findIndex(p=>!pass(p)), laterPass=firstFail>=0 && points.slice(firstFail+1).some(pass);
    if(laterPass)return {status:"nonmonotone",ranges,maxPassingValue:null,firstFailingValue:null};
    if(firstFail===0)return {status:"no-passing-sample",ranges,maxPassingValue:null,firstFailingValue:points[0].value};
    if(firstFail<0)return {status:"all-tested-pass",ranges,maxPassingValue:points.at(-1).value,firstFailingValue:null};
    return {status:"bracketed",ranges,maxPassingValue:points[firstFail-1].value,firstFailingValue:points[firstFail].value};
  }
  function createSensitivity(document,options={}) {
    const config={iterations:1000,seed:document.simulation?.seed??1,targetProbability:.8,criterion:"lower95",refineSteps:6,...options};
    if(!["duration","q"].includes(config.parameter))fail("感度パラメータはdurationまたはqです。");
    if(!document.tasks.some(t=>t.id===config.taskId))fail("対象Taskが存在しません。");
    if(!Array.isArray(config.values)||config.values.length<2||config.values.length>25)fail("感度評価点は2〜25件です。");
    config.values=[...config.values];
    config.values.forEach((v,i)=>{P.number(v,"評価値",0,config.parameter==="q"?1:1e9);if(i && v<=config.values[i-1])fail("評価値は重複なく昇順です。");});
    P.number(config.targetProbability,"Mission要求成功率",0,1);
    if(!["estimate","lower95"].includes(config.criterion))fail("要求判定方式が不正です。");
    if(!Number.isInteger(config.refineSteps)||config.refineSteps<0||config.refineSteps>8)fail("境界精査は0〜8回です。");
    const baseOptions={iterations:config.iterations,seed:config.seed};
    const baselineJob=S.createRun(document,baseOptions);
    if((config.values.length+config.refineSteps+1)*config.iterations*baselineJob.compiled.cost>20000000)fail("感度分析の総処理量が多すぎます。評価点または試行数を減らしてください（上限2,000万）。");
    // Check every intervention before starting; compilation does not consume random numbers.
    const runOptions=value=>({...baseOptions,taskOverrides:{[config.taskId]:{[config.parameter]:value}}});
    for(const value of config.values)S.compile(document,runOptions(value));
    let job=baselineJob, baseline=null, currentValue=null,index=0,refinements=0,completed=0,jobCompleted=0,done=false,cached=null;
    const points=[];
    const total=(config.values.length+config.refineSteps+1)*config.iterations;
    function step(batch=100){
      if(done)return {completed,total:completed,done:true};
      const before=job.step(batch);completed+=before.completed-jobCompleted;jobCompleted=before.completed;
      if(before.done){
        const r=job.result();
        if(baseline===null)baseline=r;
        else {points.push({value:currentValue,probability:r.successProbability,interval95:r.successInterval95,completion:r.completion,criticality:r.tasks.find(t=>t.id===config.taskId).criticality});points.sort((a,b)=>a.value-b.value);}
        if(index<config.values.length)currentValue=config.values[index++];
        else {
          const req=requirement(points,config.targetProbability,config.criterion,config.parameter==="q"?"increasing":"decreasing");
          if(refinements<config.refineSteps && req.status==="bracketed"){
            const left=config.parameter==="q"?req.lastFailingValue:req.maxPassingValue,right=config.parameter==="q"?req.minPassingValue:req.firstFailingValue;
            currentValue=(left+right)/2;
            if(currentValue===left || currentValue===right){done=true;return {completed,total:completed,done};}
            refinements++;
          }else {done=true;return {completed,total:completed,done};}
        }
        job=S.createRun(document,runOptions(currentValue));jobCompleted=0;
      }
      return {completed,total,done};
    }
    function result(){
      if(!done)fail("感度分析が完了していません。");
      if(!cached)cached={version:1,model:"paired-task-intervention",config,baseline,points,requirement:requirement(points,config.targetProbability,config.criterion,config.parameter==="q"?"increasing":"decreasing"),
        probabilityGap:Math.max(0,config.targetProbability-baseline.successProbability),refinements,
        interpretation:config.parameter==="duration"?"対象Taskの完了をTi=tに固定する介入。他TaskのCDFと構造を保持し、対象Taskの未達確率を除く。実CDFに対する十分条件ではない。":"対象Taskの入力qを固定する介入。入力の到着待ちと他TaskのCDFを保持する。",
        scope:"要求境界は評価範囲内の標本推定。未評価の値・非単調な分岐・実装備の能力は保証しない。"};
      return cached;
    }
    return {step,result,config};
  }
  function run(document,options){const job=createSensitivity(document,options);while(!job.step(256).done){}return job.result();}
  function cdfTargets(document){
    return [
      ...document.tasks.filter(t=>t.simulation?.enabled&&t.simulation.performanceModel).map(t=>({type:"task",id:t.id,label:t.label})),
      ...document.causalLinks.filter(l=>l.simulation?.enabled&&l.propagation?.performanceModel).map(l=>({type:"causalLink",id:l.id,label:l.label}))
    ].map((t,i)=>({...t,key:t.type+":"+t.id,number:i+1}));
  }
  function createAllCDF(document,options={}){
    const config={iterations:500,seed:document.simulation?.seed??1,steps:11,...options};
    if(!Number.isInteger(config.steps)||config.steps<2||config.steps>25)fail("評価点数は2〜25です。");
    const targets=cdfTargets(document);if(!targets.length)fail("実行対象のCDFがありません。Taskまたは作用線のCDFを有効にしてください。");
    const values=Array.from({length:config.steps},(_,i)=>i/(config.steps-1));
    let job=S.createRun(document,{iterations:config.iterations,seed:config.seed});
    const total=(1+targets.length*values.length)*config.iterations;
    if(total*job.compiled.cost>20000000)fail("全CDF分析の処理量が多すぎます。試行数・評価点数を減らしてください（上限2,000万）。");
    let completed=0,previous=0,index=-1,done=false,baseline=null;
    const rows=targets.map(t=>({...t,points:[]}));
    function step(batch=32){
      if(done)return {done,completed,total};
      const status=job.step(batch);completed+=status.completed-previous;previous=status.completed;
      if(status.done){
        const r=job.result();
        if(index<0)baseline={probability:r.successProbability,interval95:r.successInterval95};
        else rows[Math.floor(index/values.length)].points.push({q:values[index%values.length],probability:r.successProbability,interval95:r.successInterval95});
        index++;
        if(index>=targets.length*values.length){done=true;}
        else {
          const t=targets[Math.floor(index/values.length)],q=values[index%values.length];
          job=S.createRun(document,{iterations:config.iterations,seed:config.seed,[t.type==="task"?"taskOverrides":"linkOverrides"]:{[t.id]:{q}}});previous=0;
        }
      }
      return {done,completed,total,target:index<0?null:targets[Math.floor(index/values.length)]?.key};
    }
    function result(){
      if(!done)fail("全CDF分析が完了していません。");
      const assessed=rows.map(t=>({...t,improvement:t.points.at(-1).probability-baseline.probability,degradation:baseline.probability-t.points[0].probability,maxGain:Math.max(...t.points.map(p=>p.probability))-baseline.probability}));
      return {version:1,model:"all-cdf-input-quality-intervention",config,baseline,targets:assessed,ranking:[...assessed].sort((a,b)=>b.improvement-a.improvement||b.degradation-a.degradation||a.number-b.number).map(t=>t.key),interpretation:"対象CDFへの入力品質qのみを固定。到達・開始条件を維持し、出力品質と時間は後続へ伝搬。全評価で同じSeedを使用。改善はq=1の成功率−基準、劣化は基準−q=0の成功率。単独介入の比較であり、複数CDFの同時改善効果は評価しない。"};
    }
    return {step,result,config,targets};
  }
  const api={createSensitivity,run,requirement,cdfTargets,createAllCDF};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.MESensitivity=api;
})(globalThis);
