/* Automatic quality sensitivity with shared identifiers on graph and scenario. */
(function(root){
  'use strict';
  const M=root.ME,L=root.MELayout,R=root.MERender,A=root.MESensitivity,esc=R.esc;
  const colors=['#236d78','#a75353','#8061a8','#a56c24','#397aa0','#538447','#a55387'];
  const color=t=>colors[(t.number-1)%colors.length];
  const pct=p=>(p*100).toFixed(1)+'%',delta=p=>(p>=0?'+':'')+(p*100).toFixed(1)+' pt';
  function markers(g,result,selected){
    const offsets=new Map();
    return result.targets.map(t=>{
      const edge=g.edges.find(e=>e.type===t.type&&e.id===t.id&&e.part!=='outcome')||g.edges.find(e=>e.memberIds?.includes(t.id));
      if(!edge)return '';
      const first=edge.points[0],last=edge.points.at(-1),middle=L.pointOnRoute(edge.points,(first.x+last.x)/2,(first.y+last.y)/2);
      const key=middle.x+':'+middle.y,n=offsets.get(key)||0;offsets.set(key,n+1);
      const x=middle.x,y=middle.y-18-n*27,c=color(t),active=t.key===selected;
      return `<g class="cdf-map-marker ${active?'active':''}" data-cdf-key="${esc(t.key)}" role="button" tabindex="0" aria-label="CDF ${t.number}: ${esc(t.label)}"><title>CDF ${t.number}: ${esc(t.label)} — 分析グラフと対応</title>${active?`<path d="${edge.path}" fill="none" stroke="${c}" stroke-width="9" opacity=".3" pointer-events="none"/>`:''}<path d="M${x},${y} L${middle.x},${middle.y}" stroke="${c}"/><circle cx="${x}" cy="${y}" r="12" fill="${c}" stroke="white" stroke-width="2"/><text x="${x}" y="${y+4}" text-anchor="middle" fill="white" font-size="11" pointer-events="none">${t.number}</text></g>`;
    }).join('');
  }
  function chart(t,baseline){
    const x=q=>40+q*300,y=p=>175-p*145;
    const line=t.points.map((p,i)=>(i?'L':'M')+x(p.q)+','+y(p.probability)).join(' ');
    const band=[...t.points.map(p=>[x(p.q),y(p.interval95.high)]),...t.points.slice().reverse().map(p=>[x(p.q),y(p.interval95.low)])].map(p=>p.join(',')).join(' ');
    return `<svg class="cdf-quality-chart" viewBox="0 0 370 220" role="img" aria-label="CDF ${t.number} ${esc(t.label)}：入力品質qとMission成功率"><title>${esc(t.label)}：入力品質qとMission成功率（帯は95%信頼区間）</title>${[0,.5,1].map(p=>`<path d="M40,${y(p)} H340" stroke="#dbe5e7"/><text x="33" y="${y(p)+4}" text-anchor="end" font-size="10">${p*100}%</text><text x="${x(p)}" y="192" text-anchor="middle" font-size="10">${p}</text>`).join('')}<path d="M40,${y(baseline)} H340" stroke="#58666b" stroke-dasharray="4 3"/><polygon points="${band}" fill="${color(t)}" opacity=".18"/><path d="${line}" fill="none" stroke="${color(t)}" stroke-width="2"/>${t.points.map(p=>`<circle cx="${x(p.q)}" cy="${y(p.probability)}" r="3" fill="${color(t)}"><title>q=${p.q.toFixed(2)}: ${pct(p.probability)}（95% ${pct(p.interval95.low)}–${pct(p.interval95.high)}）</title></circle>`).join('')}<text x="190" y="213" text-anchor="middle" font-size="11">CDFへの入力品質 q</text></svg>`;
  }
  function controller({getDocument,download,onHighlight,onShowTarget,onEditTarget=()=>{}}){
    const $=s=>document.querySelector(s),dialog=$('#all-cdf-dialog'),output=$('#all-cdf-results'),map=$('#all-cdf-map'),progress=$('#all-cdf-progress'),error=$('#all-cdf-error'),run=$('#all-cdf-run'),stop=$('#all-cdf-stop'),save=$('#all-cdf-export');
    let result=null,snapshot=null,signature=null,selected=null,token=0,ranking='improvement';
    let previous=null;
    const fingerprint=d=>root.MEAuthoring.fingerprint(d);
    function remember(){if(result)previous={result:M.clone(result),snapshot:M.clone(snapshot),date:new Date().toISOString()};}
    function oldHTML(){return previous?`<details class="analysis-history" open><summary>変更前の分析：基準成功率 ${pct(previous.result.baseline.probability)}</summary><p>旧設定の結果です。現在のシナリオには適用しません。入力文書と結果は保存できます。</p><button type="button" data-previous-export>変更前の分析JSON保存</button>${previous.result.targets.map(t=>`<article><strong>${esc(t.label)}</strong>${chart(t,previous.result.baseline.probability)}</article>`).join('')}</details>`:'';}
    function cancel(){token++;run.disabled=false;stop.hidden=true;}
    function invalidate(){const next=fingerprint(getDocument());if(signature!==null&&signature!==next){remember();cancel();result=null;selected=null;save.disabled=true;output.innerHTML=oldHTML();map.innerHTML='';progress.textContent='実行設定が変わりました。変更前の結果を保持しています。再分析して比較できます。';signature=next;}}
    function drawMap(){
      if(!result)return;
      const d=M.clone(snapshot);d.views.main.mode='mission';const g=L.layout(d,1100,{full:true});
      map.innerHTML=R.render(d,g,{export:false,full:true});map.querySelector('svg').insertAdjacentHTML('beforeend',markers(g,result,selected));
      [...map.querySelectorAll('[data-cdf-key]')].find(e=>e.dataset.cdfKey===selected)?.scrollIntoView?.({block:'nearest',inline:'nearest'});
    }
    function sorted(){return [...result.targets].sort((a,b)=>b[ranking]-a[ranking]||a.number-b.number);}
    function draw(){
      if(!result)return;
      output.innerHTML=`<p>基準成功率 <strong>${pct(result.baseline.probability)}</strong>（95% ${pct(result.baseline.interval95.low)}–${pct(result.baseline.interval95.high)}）</p><p class="muted">改善：q=1 − 基準。劣化への弱さ：基準 − q=0。単位ptは成功率の差。単独変更の標本推定で、同時改善の相互作用は含みません。グラフの実線は成功率、帯は95%信頼区間、灰色破線は基準成功率です。</p><label>順位 <select id="all-cdf-ranking"><option value="improvement">改善効果</option><option value="degradation">劣化への弱さ</option></select></label><table><thead><tr><th>順位 / CDF</th><th>改善</th><th>劣化への弱さ</th></tr></thead><tbody>${sorted().map((t,i)=>`<tr><td><button type="button" data-cdf-key="${esc(t.key)}" style="border-left:5px solid ${color(t)}">${i+1}位 · #${t.number} ${esc(t.label)} (${t.type==='task'?'Task':'作用線'})</button></td><td>${delta(t.improvement)}</td><td>${delta(t.degradation)}</td></tr>`).join('')}</tbody></table>${sorted().map(t=>`<article class="cdf-analysis-card ${selected===t.key?'active':''}" data-cdf-card="${esc(t.key)}" style="--cdf-color:${color(t)}"><h3><button type="button" data-cdf-key="${esc(t.key)}">#${t.number} ${esc(t.label)}</button><small>${t.type==='task'?'Task':'作用線'} · ${esc(t.id)}</small></h3>${chart(t,result.baseline.probability)}<button type="button" data-cdf-show="${esc(t.key)}">シナリオ図で確認</button></article>`).join('')}`;
      $('#all-cdf-ranking').value=ranking;$('#all-cdf-ranking').onchange=e=>{ranking=e.target.value;draw();};drawMap();
      output.insertAdjacentHTML('afterbegin',previous?`<p class="analysis-comparison">変更前 ${pct(previous.result.baseline.probability)} → 現在 ${pct(result.baseline.probability)}（${delta(result.baseline.probability-previous.result.baseline.probability)}）。各モデルの標本推定の比較です。</p>`:'');
      output.insertAdjacentHTML('beforeend',oldHTML());
      for(const card of output.querySelectorAll('[data-cdf-card]')){const b=document.createElement('button');b.type='button';b.dataset.cdfEdit=card.dataset.cdfCard;b.textContent='性能設定を編集';card.append(b);}
    }
    function focus(key,open=true){invalidate();if(!result?.targets.some(t=>t.key===key))return;selected=key;draw();onHighlight();if(open&&!dialog.open)dialog.showModal();const card=[...output.querySelectorAll('[data-cdf-card]')].find(e=>e.dataset.cdfCard===key);card?.scrollIntoView?.({block:'nearest'});}
    function open(){invalidate();dialog.showModal();}
    function choose(e){const editor=e.target.closest('[data-cdf-edit]');if(editor){const target=result?.targets.find(t=>t.key===editor.dataset.cdfEdit);if(target){dialog.close();onEditTarget(target);}return;}if(e.target.closest('[data-previous-export]')){download(new Blob([JSON.stringify({mission:previous.snapshot,analysis:previous.result},null,2)],{type:'application/json'}),'mission-all-cdf-analysis-previous.json');return;}const show=e.target.closest('[data-cdf-show]'),node=e.target.closest('[data-cdf-key]');if(show){focus(show.dataset.cdfShow,false);dialog.close();onShowTarget(result.targets.find(t=>t.key===selected));return;}if(node){focus(node.dataset.cdfKey);return;}const edge=e.target.closest('[data-type][data-id]');if(edge)focus(edge.dataset.type+':'+edge.dataset.id);}
    output.addEventListener('click',choose);map.addEventListener('click',choose);
    map.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.closest('[data-cdf-key]')){e.preventDefault();choose(e);}});
    $('#all-cdf-close').onclick=()=>dialog.close();dialog.addEventListener('close',cancel);stop.onclick=()=>{cancel();progress.textContent='分析を中断しました。';};
    $('#all-cdf-form').onsubmit=e=>{
      e.preventDefault();remember();cancel();result=null;selected=null;output.innerHTML=oldHTML();map.innerHTML='';save.disabled=true;onHighlight();snapshot=getDocument();signature=fingerprint(snapshot);let job;
      try{const f=e.target.elements;job=A.createAllCDF(snapshot,{iterations:Number(f.iterations.value),steps:Number(f.steps.value),seed:snapshot.simulation?.seed??1});error.textContent='';}catch(err){error.textContent=err.message;return;}
      run.disabled=true;stop.hidden=false;const current=++token;
      function tick(){if(current!==token)return;try{const status=job.step(32);progress.textContent=`${status.completed.toLocaleString()} / ${status.total.toLocaleString()} 試行 · ${job.targets.length} CDF`;if(!status.done){setTimeout(tick,0);return;}result=job.result();cancel();save.disabled=false;selected=result.ranking[0];draw();onHighlight();}catch(err){cancel();error.textContent=err.message;}}
      setTimeout(tick,0);
    };
    save.onclick=()=>{invalidate();if(result)download(new Blob([JSON.stringify({mission:snapshot,analysis:result},null,2)],{type:'application/json'}),'mission-all-cdf-analysis.json');};
    return {open,focus,invalidate,getState:()=>({result,selected})};
  }
  root.MEAllCDFUI={controller,markers};
})(globalThis);
