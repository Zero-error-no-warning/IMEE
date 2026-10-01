/* Convert the frozen pre-v2 samples for comparison. Not a general v1 importer.
 * Keep every old action interval and causal timestamp; document merges explicitly.
 */
const fs = require('node:fs'), path = require('node:path');
const M = require('../js/model');
const root = path.join(__dirname, '..');
const sourceCommit = '618818426ac7e8e2a4f4ea14af6f0e482c9f8b04';
const names = ['coastal', 'submarine', 'research'];
function convert(old) {
  const originalStates = new Map(old.states.map(s => [s.id, s]));
  const states = [], tasks = [], stateMap = {}, transitionMap = {};
  const terminal = new Set(['e4', 'e5']);
  const startNames = {
    e1:'進出開始', e2:'任務開始', e3:'離脱開始',
    e4:'離脱完了', e5:'無力化', s1:'監視開始', s2:'探知済',
    c1:'待機開始', c2:'識別開始', c3:'判断開始',
    u1:'哨戒開始', u2:'接敵開始', u3:'攻撃開始', t1:'待機開始', t2:'誘導開始',
  };
  const endNames = {
    e1:'進出終了', e2:'任務終了', e3:'離脱中', s2:'追尾終了',
    c2:'識別終了', c3:'判断終了', u1:'哨戒終了', u2:'接敵完了',
    u3:'攻撃終了', t2:'誘導終了',
  };
  for (const s of old.states) {
    states.push({ id:s.id, actorId:s.actorId, name:startNames[s.id], time:s.start,
      status:s.status, activity:s.activity, phase:s.phase || 'other', notes:s.notes || '' });
    if (terminal.has(s.id)) {
      stateMap[s.id] = { type:'state', id:s.id, start:s.start, end:s.end,
        rule:'到達結果。旧endまでの保持は暗黙とし、終端を比較台帳に保存。' };
      continue;
    }
    const instant = old.transitions.find(t => t.from === s.id && originalStates.get(t.to).start === s.end);
    const endId = instant ? instant.to : 'end-' + s.id;
    if (!instant) states.push({ id:endId, actorId:s.actorId, name:endNames[s.id] || s.name+'終了',
      time:s.end, status:s.status, activity:s.activity, notes:'' });
    const t = { id:'activity-'+s.id, fromStateId:s.id, toStateId:endId,
      label:s.name, status:s.status, activity:s.activity, notes:s.notes || '' };
    // Carry the old decision role as metadata on the start State; no new decision time is invented.
    if (s.id === 's2') t.kind = 'observation'; // The old friendly receiving side performs detection/tracking.
    tasks.push(t);
    stateMap[s.id] = { type:'task', id:t.id, startStateId:s.id, endStateId:endId,
      start:s.start, end:s.end, rule:instant ? '行動期間をTask化。終了点と次の開始点を共有。' : '行動期間をTask化。両端の時刻を保持。' };
  }
  for (const t of old.transitions) {
    const from = stateMap[t.from].endStateId || t.from, to=t.to;
    if (from === to) {
      transitionMap[t.id] = { type:'state', id:to, rule:'同時刻の接続を共有Stateへ統合。' };
      continue;
    }
    if (t.id === 'disabled') {
      transitionMap[t.id] = { type:'task', id:'escape', junctionId:'j-escape-hit', toStateId:to,
        rule:'離脱阻止の成功枝へ統合。重複する直接遷移は描かない。' };
      continue;
    }
    const label = t.label || '移行';
    tasks.push({ id:t.id, fromStateId:from, toStateId:to, label,
      status:t.status, notes:t.notes || '' });
    transitionMap[t.id] = { type:'task', id:t.id, rule:'旧Transitionの終了・開始境界を同時刻のTaskで接続。' };
  }
  const escape=tasks.find(t=>t.id==='escape');
  escape.label='離脱成立';
  // Keep the original 44..52 window, with the real intervention at 46 on the Task.
  escape.junctions=[{id:'j-escape-hit',time:46,outcomes:[{toStateId:'e5',label:'阻止成功'}]}];
  escape.notes='旧escapeの44〜52分を保持。46分の命中で無力化へ分岐。元の離脱完了への実線は阻止失敗時の予定経路。旧disabledをこの成功枝へ統合。';
  function endpoint(stateId,time) {
    const s=originalStates.get(stateId), mapping=stateMap[stateId];
    if(time===s.start) return {type:'state',id:stateId};
    if(time===s.end && mapping.endStateId) return {type:'state',id:mapping.endStateId};
    if(mapping.type!=='task') throw Error('Cannot attach to terminal hold: '+stateId);
    return {type:'task',id:mapping.id,time};
  }
  const convertedStateTime = new Map(states.map(s => [s.id, s.time]));
  const pointTime = p => p.type === 'state' ? convertedStateTime.get(p.id) : p.time;
  const causalLinks=old.interactions.map(c=>{
    const source=endpoint(c.fromStateId,c.sourceTime);
    const targetPoint=c.targetType==='transition'
      ? {type:'task',id:transitionMap[c.targetId].id,time:c.time}
      : endpoint(c.targetId,c.time);
    const propagation={duration:pointTime(targetPoint)-pointTime(source)};
    const target={type:targetPoint.type,id:targetPoint.id};
    return {
      id:c.id,source,target,propagation,
      polarity:c.effect==='block'?'negative':'positive',label:c.label,kind:c.kind,
      ...(c.proposed?{proposed:true}:{}),notes:c.notes || '',
    };
  });
  const bindings=(old.bindings || []).map(b=>{
    const mapped=b.targetType==='state'?stateMap[b.targetId]
      :b.targetType==='transition'?transitionMap[b.targetId]
      :{type:b.targetType==='interaction'?'causalLink':b.targetType,id:b.targetId};
    return {...b,targetType:mapped.type,targetId:mapped.id};
  });
  const doc=M.defaults({version:2,title:old.title,
    notes:'旧サンプル（commit '+sourceCommit+'）と同じシナリオ。Actor・行動期間・因果時刻・技術評価は比較用に保持。旧期間Stateの行動はTaskへ、到達結果は時点Stateへ変換。変換対応はdocs/sample-migration.mdを参照。',
    time:M.clone(old.time),actors:M.clone(old.actors),states,tasks,causalLinks,
    technologies:M.clone(old.technologies || []),bindings,
    views:{main:{...M.clone(old.views.main),laneHeight:64,
      filters:{...old.views.main.filters,causalLink:old.views.main.filters.interaction,technology:false}}},
  });
  delete doc.views.main.filters.interaction;
  M.validate(doc);
  return {doc, mapping:{stateMap,transitionMap}};
}
const all={}, mappings={sourceCommit};
for(const name of names) {
  const old=JSON.parse(fs.readFileSync(path.join(root,'examples/comparison-v1',name+'.json'),'utf8'));
  const {doc,mapping}=convert(old); all[name]=doc; mappings[name]=mapping;
}
fs.writeFileSync(path.join(root,'js/sample.js'),
  '/* Generated by scripts/restore-comparison-samples.cjs from the frozen pre-v2 scenarios. */\n'+
  '(function(root) {\n  "use strict";\n  const data = '+JSON.stringify(all,null,2)+';\n'+
  '  const sample = () => JSON.parse(JSON.stringify(data.coastal));\n'+
  '  const grouped = () => JSON.parse(JSON.stringify(data.submarine));\n'+
  '  const research = () => JSON.parse(JSON.stringify(data.research));\n'+
  '  if (typeof module !== "undefined" && module.exports) {\n'+
  '    module.exports = sample; module.exports.grouped = grouped; module.exports.research = research;\n'+
  '  } else { root.createSample = sample; root.createGroupedSample = grouped; root.createResearchSample = research; }\n'+
  '})(globalThis);\n');
fs.writeFileSync(path.join(root,'examples/comparison-v1/mapping.json'),JSON.stringify(mappings,null,2)+'\n');
