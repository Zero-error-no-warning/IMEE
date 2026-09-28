(function (root) {
  'use strict';
  const state = (id, actorId, name, start, end, activity = 'active', status = 'actual') => ({ id, actorId, name, start, end, activity, status, notes: '' });
  const transition = (id, from, to, status = 'actual', label = '') => ({ id, from, to, status, label });
  const interaction = (id, fromStateId, targetId, label, kind, sourceTime, time) => ({ id, fromStateId, targetId, label, kind, sourceTime, time, targetType: 'state', effect: 'cause', outcomeStateId: null });
  function sample() {
    return {
      version: 1, title: '海域監視 — 敵UUVの任務阻止', time: { unit: 'minutes', duration: 60, snap: 1 },
      actors: [
        { id: 'enemy', name: '敵UUV', side: 'hostile', notes: '監視海域で任務を遂行し、離脱する計画。' },
        { id: 'sensor', name: '海底センサー', side: 'friendly', notes: '' },
        { id: 'control', name: '管制', side: 'friendly', notes: '' },
        { id: 'uuv', name: '味方UUV', side: 'friendly', notes: '' },
        { id: 'torpedo', name: '魚雷', side: 'friendly', notes: '' }
      ],
      states: [
        state('e1', 'enemy', '進出', 0, 12), state('e2', 'enemy', '任務遂行', 14, 34), state('e3', 'enemy', '離脱', 36, 44),
        state('e4', 'enemy', '離脱完了', 52, 60, 'active', 'planned'), state('e5', 'enemy', '無力化', 46, 60),
        state('s1', 'sensor', '監視', 0, 14, 'quiet'), state('s2', 'sensor', '探知・追尾', 14, 48),
        state('c1', 'control', '待機', 0, 18, 'quiet'), state('c2', 'control', '識別', 18, 25), state('c3', 'control', '交戦判断', 27, 33),
        state('u1', 'uuv', '哨戒', 0, 29, 'quiet'), state('u2', 'uuv', '接敵', 31, 38), state('u3', 'uuv', '攻撃', 40, 46),
        state('t1', 'torpedo', '待機', 0, 40, 'quiet'), state('t2', 'torpedo', '誘導', 40, 46)
      ],
      transitions: [transition('et1', 'e1', 'e2'), transition('et2', 'e2', 'e3'), transition('escape', 'e3', 'e4', 'planned', '離脱成立'), transition('disabled', 'e3', 'e5'), transition('st1', 's1', 's2'), transition('ct1', 'c1', 'c2'), transition('ct2', 'c2', 'c3'), transition('ut1', 'u1', 'u2'), transition('ut2', 'u2', 'u3'), transition('tt1', 't1', 't2')],
      interactions: [
        interaction('detect', 'e2', 's2', '発見', 'detection', 14, 14),
        interaction('report', 's2', 'c2', '探知情報', 'information', 17, 18),
        interaction('order', 'c3', 'u2', '接敵指示', 'command', 30, 31),
        interaction('launch', 'u3', 't2', '発射', 'attack', 40, 40),
        { id: 'hit', fromStateId: 't2', targetType: 'transition', targetId: 'escape', label: '命中・離脱阻止', kind: 'attack', sourceTime: 46, time: 46, effect: 'block', outcomeStateId: 'e5', notes: '離脱 → 離脱完了という予定遷移を阻止。実際には無力化へ遷移する。' }
      ]
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = sample;
  else root.createSample = sample;
})(globalThis);
