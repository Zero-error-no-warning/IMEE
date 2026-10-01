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
    const visible=item=>options.full||v.filters.quiet||item.activity!=="quiet";
    const stateVisible=id=>{const s=M.get(doc,"state",id);return s&&visible(s);};
    const add=(key,actorId,start,end,curve,nodeIds)=>{
      const spec={key,actorId:displayActor(actorId),start,end:Math.max(start,end),curve,nodeIds};
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
      if(!visible(t)||!stateVisible(t.fromStateId)||(t.toStateId&&!stateVisible(t.toStateId)))continue;
      const s=M.get(doc,"state",t.fromStateId),w=M.taskWindow(doc,t);
      const c=curve("task",t.id,M.nominalStart(doc,t),t.simulation?.enabled?t.simulation.performanceModel:null);
      const spec=add("task:"+t.id,s.actorId,c?.kind==="results"?0:w.start,extent(c,w.end),c,[s.id,t.toStateId||s.id]);
      spec.lineStart=w.start;spec.lineEnd=w.end;
      if(w.start>s.time)add("wait:"+t.id,s.actorId,s.time,w.start,null,[s.id,s.id]);
      const to=M.get(doc,"state",t.toStateId);
      if(to&&to.time>w.end)add("receipt:"+t.id,s.actorId,w.end,to.time,null,[to.id,to.id]);
      for(const j of t.junctions||[])for(const [i,o]of j.outcomes.entries()){
        if(!stateVisible(o.toStateId))continue;
        const to=M.get(doc,"state",o.toStateId),at=j.time+(o.delay??to.time-j.time);
        add("outcome:"+j.id+":"+i,s.actorId,j.time,at);
        if(at<to.time)add("receipt:"+j.id+":"+i,to.actorId,at,to.time,null,[to.id,to.id]);
      }
    }
    for(const l of doc.causalLinks){
      if(!options.full&&(!v.filters.causalLink||(displayActor(M.endpoint(doc,l.source).actorId)===displayActor(M.endpoint(doc,l.target).actorId)&&v.collapsedActors.includes(displayActor(M.endpoint(doc,l.source).actorId)))))continue;
      if(!stateVisible(l.source.id)||(l.target.type==="state"&&!stateVisible(l.target.id))||(l.target.type==="junction"&&!visible(M.get(doc,"task",l.target.taskId))))continue;
      const s=M.get(doc,"state",l.source.id),end=M.causalArrivalTime(doc,l);
      const c=curve("causalLink",l.id,s.time,l.simulation?.enabled?l.propagation.performanceModel:null);
      add("causalLink:"+l.id,s.actorId,c?.kind==="results"?0:s.time,extent(c,end),c);
      const to=l.target.type==="state"?M.get(doc,"state",l.target.id):null;
      if(to&&end<to.time)add("receipt:"+l.id,to.actorId,end,to.time,null,[to.id,to.id]);
    }
    if(mode==="results")for(const s of doc.states){if(!visible(s))continue;const c=curve("state",s.id,0);if(c)add("state:"+s.id,s.actorId,0,extent(c,s.time),c,[s.id,s.id]);}
    const tracks=new Map();
    return {tracks,specs:new Map(specs.map(s=>[s.key,s])),curves,mode,q,result};
  }
  function position(axis,actorId,top,states){
    const list=[],inline=[],used=[];
    const specs=[...axis.specs.values()].filter(s=>s.actorId===actorId)
      .sort((a,b)=>a.start-b.start||a.end-b.end||a.key.localeCompare(b.key));
    for(const spec of specs){
      const [a,b]=(spec.nodeIds||[]).map(id=>states.get(id));
      const overlap=(a0,a1,b0,b1)=>Math.max(a0,b0)<Math.min(a1,b1);
      if(a&&b&&a.y===b.y&&!used.some(s=>s.y===a.y&&(
        (s.curve&&spec.curve&&overlap(s.start,s.end,spec.start,spec.end))||
        (!s.key.startsWith('state:')&&!spec.key.startsWith('state:')&&overlap(s.lineStart??s.start,s.lineEnd??s.end,spec.lineStart??spec.start,spec.lineEnd??spec.end))
      ))){
        spec.y=a.y;inline.push(spec);used.push(spec);continue;
      }
      // A zero-time connection has no horizontal span to reserve.
      if(!spec.curve&&spec.end===spec.start)continue;
      let track=list.find(t=>t.end<=spec.start+1e-9);
      if(!track){track={end:-Infinity,height:24,specs:[]};list.push(track);}
      track.end=spec.end;track.height=Math.max(track.height,spec.curve?88:24);track.specs.push(spec);
    }
    // Put the first CDF above the existing Task baseline, instead of bending
    // the Task into a new lane below its two nodes.
    const padding=inline.some(s=>s.curve)?68:0;
    if(padding)for(const s of states.values())if(s.displayActorId===actorId)s.y+=padding;
    for(const spec of inline)spec.y+=padding;
    let y=top+padding;
    for(const track of list){y+=track.height;for(const spec of track.specs)spec.y=y-12;}
    axis.tracks.set(actorId,list);
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
