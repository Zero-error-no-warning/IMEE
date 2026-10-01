/* Shared clock geometry. Curves retain elapsed-time units and missing mass. */
(function(root){
  "use strict";
  const node=typeof module!=="undefined"&&module.exports;
  const M=node?require("./model.js"):root.ME;
  const P=node?require("./performance.js"):root.MEPerformance;
  function prepare(doc,options,displayActor){
    const v=doc.views.main,mode=v.cdfMode||"config",q=options.cdfQ??v.cdfQ??1;
    const selection=options.cdfSelection||[],all=(v.cdfScope||"selected")==="all";
    const shown=(type,id)=>all||selection.some(s=>s.type===type&&s.id===id);
    const result=options.cdfResult, specs=[],curves=[];
    const add=(key,actorId,start,end,curve)=>{
      const spec={key,actorId:displayActor(actorId),start,end:Math.max(start,end),curve};
      specs.push(spec);if(curve)curves.push({...curve,spec});return spec;
    };
    function curve(type,id,start,model){
      if(mode==="off"||!shown(type,id))return null;
      if(mode==="results"){
        const event=type==="task"?"completed":type==="state"?"established":"arrived";
        const h=result?.eventDistributions?.find(h=>h.type===type&&h.id===id&&h.event===event);
        return h?{type,id,kind:"results",start:0,points:h.points,step:h.step,total:h.total,count:h.count,event}:null;
      }
      if(!model)return null;
      return {type,id,kind:"config",start,points:P.distribution(model,q),q};
    }
    function extent(c,end){return c?Math.max(end,c.start+(c.points.at(-1)?.t||0)):end;}
    for(const t of doc.tasks){
      const s=M.get(doc,"state",t.fromStateId),w=M.taskWindow(doc,t);
      const c=curve("task",t.id,M.nominalStart(doc,t),t.simulation?.enabled?t.simulation.performanceModel:null);
      add("task:"+t.id,s.actorId,c?.kind==="results"?0:w.start,extent(c,w.end),c);
      if(w.start>s.time)add("wait:"+t.id,s.actorId,s.time,w.start);
      const to=M.get(doc,"state",t.toStateId);
      if(to&&to.time>w.end)add("receipt:"+t.id,s.actorId,w.end,to.time);
      for(const j of t.junctions||[])for(const [i,o]of j.outcomes.entries()){
        const to=M.get(doc,"state",o.toStateId),at=j.time+(o.delay??to.time-j.time);
        add("outcome:"+j.id+":"+i,s.actorId,j.time,at);
        if(at<to.time)add("receipt:"+j.id+":"+i,to.actorId,at,to.time);
      }
    }
    for(const l of doc.causalLinks){
      const s=M.get(doc,"state",l.source.id),end=M.causalArrivalTime(doc,l);
      const c=curve("causalLink",l.id,s.time,l.simulation?.enabled?l.propagation.performanceModel:null);
      add("causalLink:"+l.id,s.actorId,c?.kind==="results"?0:s.time,extent(c,end),c);
      const to=l.target.type==="state"?M.get(doc,"state",l.target.id):null;
      if(to&&end<to.time)add("receipt:"+l.id,to.actorId,end,to.time);
    }
    if(mode==="results")for(const s of doc.states){const c=curve("state",s.id,0);if(c)add("state:"+s.id,s.actorId,0,extent(c,s.time),c);}
    const tracks=new Map();
    for(const spec of specs.sort((a,b)=>a.start-b.start||a.end-b.end||a.key.localeCompare(b.key))){
      let list=tracks.get(spec.actorId);if(!list)tracks.set(spec.actorId,list=[]);
      let track=list.find(t=>t.end<spec.start-1e-9);
      if(!track){track={end:-Infinity,height:44,specs:[]};list.push(track);}
      track.end=spec.end;track.height=Math.max(track.height,spec.curve?88:44);track.specs.push(spec);
    }
    return {tracks,specs:new Map(specs.map(s=>[s.key,s])),curves,mode,q,result};
  }
  function position(axis,actorId,top){
    let y=top;
    for(const track of axis.tracks.get(actorId)||[]){y+=track.height;for(const spec of track.specs)spec.y=y-18;}
    return y-top;
  }
  function chart(c,vp){
    const y=c.spec.y,h=48,points=[{x:vp.x(c.start),y}];
    for(const p of c.points){const x=vp.x(c.start+p.t);if(c.kind==="results")points.push({x,y:points.at(-1).y});points.push({x,y:y-h*p.p});}
    return {...c,y,height:h,distribution:c.points,points,startX:vp.x(c.start),endX:vp.x(c.start+(c.points.at(-1)?.t||0)),finalP:c.points.at(-1)?.p||0};
  }
  const api={prepare,position,chart};
  if(node)module.exports=api;else root.METimeAxis=api;
})(globalThis);
