/* Invalid imports retain their source and use a separate, defensive display model. */
(function(root){
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('./model'):root.ME;
  function inspect(text){
    const original=JSON.parse(text);
    if(!original || typeof original!=='object' || Array.isArray(original))throw new Error('JSONのトップレベルはオブジェクトにしてください。');
    const errors=[];
    try{M.validate(M.clone(original));}catch(e){errors.push({message:e.message,path:e.validationPath || '$',fragment:e.validationFragment});}
    if(!errors.length)return {original,document:M.defaults(M.clone(original)),errors};
    const d=M.clone(original), list=k=>Array.isArray(d[k])?d[k].filter(x=>x&&typeof x==='object'&&!Array.isArray(x)):[];
    const duration=Number.isFinite(d.time?.duration)&&d.time.duration>0?Math.min(d.time.duration,1e6):Math.max(100,...list('states').map(s=>Number.isFinite(s.time)?s.time:0));
    const time=t=>Number.isFinite(t)?Math.max(0,Math.min(t,duration)):0;
    const str=(s,f)=>typeof s==='string'?s:f;
    const omitted=(collection,item,message)=>{const i=Array.isArray(original[collection])?original[collection].findIndex(x=>x?.id===item?.id):-1;const path=i>=0?`$.${collection}[${i}]`:`$.${collection}`;if(!errors.some(e=>e.path===path))errors.push({message,path,fragment:item});};
    const unique=(items,key)=>{const seen=new Set();return items.filter(x=>{if(typeof x.id!=='string'||!x.id||seen.has(x.id)){omitted(key,x,'IDが欠落または重複しているため、この項目を描画できません。');return false;}seen.add(x.id);return true;});};
    d.version=3;d.title=str(d.title,'エラーのある文書');d.time={unit:['seconds','minutes','hours'].includes(d.time?.unit)?d.time.unit:'seconds',duration,snap:1};
    d.actors=unique(list('actors'),'actors').map(a=>({...a,name:str(a.name,a.id),side:['friendly','hostile','neutral'].includes(a.side)?a.side:'neutral',parentId:null,color:/^#[0-9a-f]{6}$/i.test(a.color)?a.color:undefined}));
    const actors=new Set(d.actors.map(a=>a.id));
    for(const a of d.actors){
      const parent=original.actors?.find(x=>x?.id===a.id)?.parentId;
      const seen=new Set([a.id]);let id=parent,cycle=false;
      while(id && actors.has(id)){if(seen.has(id)){cycle=true;break;}seen.add(id);id=original.actors.find(x=>x?.id===id)?.parentId;}
      if(parent && actors.has(parent) && !cycle)a.parentId=parent;
    }
    d.states=unique(list('states'),'states').filter(s=>{if(actors.has(s.actorId))return true;omitted('states',s,'所属Actorが存在しないため、このStateを描画できません。');return false;}).map(s=>({...s,name:str(s.name,s.id),time:time(s.time)}));
    const states=new Set(d.states.map(s=>s.id));
    d.tasks=unique(list('tasks'),'tasks').filter(t=>{if(states.has(t.fromStateId))return true;omitted('tasks',t,'起点Stateが存在しないため、このTaskを描画できません。');return false;}).map(t=>{
      const j=Array.isArray(t.junctions)?t.junctions:[];
      return {...t,label:str(t.label,t.id),toStateId:states.has(t.toStateId)?t.toStateId:undefined,junctions:j.filter(x=>x&&typeof x.id==='string').map(x=>({...x,time:time(x.time),outcomes:(Array.isArray(x.outcomes)?x.outcomes:[]).filter(o=>o&&states.has(o.toStateId)).map(o=>({...o,label:str(o.label,'結果')}))})).filter(x=>x.outcomes.length)};
    }).filter(t=>{if(t.toStateId||t.junctions.length)return true;omitted('tasks',t,'到達先Stateが存在しないため、このTaskを描画できません。');return false;});
    const validEndpoint=e=>e?.type==='state'?states.has(e.id):e?.type==='junction'&&d.tasks.some(t=>t.id===e.taskId&&t.junctions.some(j=>j.id===e.id));
    d.causalLinks=unique(list('causalLinks'),'causalLinks').filter(c=>{if(c.source?.type==='state'&&validEndpoint(c.source)&&validEndpoint(c.target)&&Number.isFinite(c.propagation?.duration))return true;omitted('causalLinks',c,'作用線の端点または伝搬時間が不正なため、この線を描画できません。');return false;}).map(c=>({...c,label:str(c.label,c.id)}));
    d.technologies=unique(list('technologies'),'technologies').map(t=>({...t,name:str(t.name,t.id),status:['existing','research','planned','gap','unknown'].includes(t.status)?t.status:'unknown'}));
    d.bindings=list('bindings').filter(b=>['task','causalLink','actor','state'].includes(b.targetType)&&M.get(d,b.targetType,b.targetId)&&d.technologies.some(t=>t.id===b.technologyId));
    for(const t of d.tasks)t.simulation={enabled:false};
    for(const c of d.causalLinks){c.simulation={enabled:false};c.propagation={duration:c.propagation.duration};}
    delete d.simulation;d.views={};M.defaults(d);
    return {original,document:d,errors};
  }
  function target(result,error){
    const match=/^\$\.(actors|states|tasks|causalLinks|technologies)\[(\d+)\]/.exec(error.path);
    const types={actors:'actor',states:'state',tasks:'task',causalLinks:'causalLink',technologies:'technology'};
    const item=match&&result.original[match[1]]?.[+match[2]];
    if(item)return {type:types[match[1]],id:item.id};
    if(error.target)return error.target;
    const involved=error.fragment?.items||[];
    const cause=result.original.causalLinks?.find(c=>involved.some(x=>x?.id===c.id));
    return cause?{type:'causalLink',id:cause.id}:null;
  }
  function bubbles(result,geometry,esc){
    const positions=new Map();let fallback=0;
    return result.errors.map((e,index)=>{
      const match=/^\$\.(actors|states|tasks|causalLinks)\[(\d+)\]/.exec(e.path),ref=target(result,e);
      const item=match?result.original[match[1]]?.[+match[2]]:ref?M.get(result.original,ref.type,ref.id):null;
      let point=ref?.type==='state'?geometry.states.get(ref.id):ref?.type==='actor'?geometry.rows.find(r=>r.actor.id===ref.id):null;
      if(point?.center!==undefined)point={x:geometry.vp.left,y:point.center};
      if(!point&&item){const edge=geometry.edges.find(x=>x.id===item.id);point=edge?.points.at(-1);}
      if(!point&&item?.source?.id)point=geometry.states.get(item.source.id);
      if(!point&&item?.fromStateId)point=geometry.states.get(item.fromStateId);
      point ||= {x:geometry.vp.left,y:54+(fallback++)*110};
      const key=point.x+':'+point.y,offset=positions.get(key)||0;positions.set(key,offset+1);
      const x=Math.max(8,Math.min(point.x+12,geometry.vp.width-320)),y=Math.max(34,point.y-24+offset*110);
      const detail=e.message+'\nJSON path: '+e.path+'\n'+JSON.stringify(e.fragment,null,2);
      return `<g class="import-error${result.source==='edit'?' edit-error':''}" data-error-path="${esc(e.path)}"><path d="M${point.x},${point.y} L${x},${y+20}" stroke="#b42318" fill="none"/><circle cx="${point.x}" cy="${point.y}" r="9" fill="none" stroke="#b42318" stroke-width="2"/><foreignObject x="${x}" y="${y}" width="310" height="104"><div xmlns="http://www.w3.org/1999/xhtml" style="background:#fff3f0;border:2px solid #b42318;border-radius:8px;padding:7px;box-sizing:border-box;height:100%;overflow:auto;font-size:12px;font-family:inherit;color:#7a211a"><div style="display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff3f0"><strong>${result.source==='edit'?'編集エラー':'読み込みエラー'}</strong>${result.source==='edit'?`${ref?`<button type="button" data-edit-error="${index}">修正</button>`:''}<button type="button" class="undo-edit-error">戻す</button>`:''}<button type="button" class="copy-import-error" style="cursor:pointer" aria-label="エラー詳細をコピー">コピー</button></div><pre class="import-error-detail" tabindex="0" style="user-select:text;-webkit-user-select:text;white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;margin:4px 0">${esc(detail)}</pre></div></foreignObject></g>`;
    }).join('');
  }
  const api={inspect,bubbles,target};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MEImportDiagnostics=api;
})(globalThis);
