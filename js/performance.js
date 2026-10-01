/* Task and causal-link CDFs; shared by the editor, validator and Node tests. */
(function (root) {
  "use strict";
  const fail = message => { throw new Error(message); };
  function number(value, label, min, max) {
    if (!Number.isFinite(value) || value < min || value > max)
      fail(label + "が範囲外です。");
  }
  function validateTask(sim, label = "Task") {
    if (sim === undefined) return;
    if (!sim || typeof sim !== "object" || Array.isArray(sim) || typeof sim.enabled !== "boolean")
      fail(label + ": simulation.enabledは真偽値です。");
    if (sim.w !== undefined) number(sim.w, label + ": w", 0, 1);
    const model = sim.performanceModel;
    if (sim.enabled && !model) fail(label + ": CDFが必要です。");
    if (!model) return;
    if (model.type !== "cdf" || (model.degradationInput !== undefined && model.degradationInput !== "w"))
      fail(label + ": performanceModelはcdf / wを指定してください。");
    if (!Array.isArray(model.curves) || !model.curves.length || model.curves.length > 100)
      fail(label + ": CDF曲線は1〜100件です。");
    let previousW = -1;
    for (const curve of model.curves) {
      if (!curve || typeof curve !== "object") fail(label + ": CDF曲線が不正です。");
      number(curve.w, label + ": 曲線のw", 0, 1);
      if (curve.w <= previousW) fail(label + ": 曲線のwは重複なく昇順にしてください。");
      previousW = curve.w;
      number(curve.pInfinity, label + ": 未達確率", 0, 1);
      if (!Array.isArray(curve.points) || !curve.points.length || curve.points.length > 1000)
        fail(label + ": CDF点は1〜1,000件です。");
      let previousT = -1, previousP = 0;
      for (const point of curve.points) {
        if (!point || typeof point !== "object") fail(label + ": CDF点が不正です。");
        number(point.t, label + ": CDF時間", 0, 1e9);
        number(point.p, label + ": 累積確率", 0, 1);
        if (point.t <= previousT || point.p < previousP)
          fail(label + ": CDF時間は昇順、累積確率は単調非減少にしてください。");
        previousT = point.t;
        previousP = point.p;
      }
      if (Math.abs(previousP + curve.pInfinity - 1) > 1e-10)
        fail(label + ": 最終累積確率 + 未達確率は1にしてください。");
    }
    const w = sim.w ?? 0;
    if (w < model.curves[0].w || w > model.curves.at(-1).w)
      fail(label + ": 入力wを含むCDF曲線が必要です。");
  }
  // Origin is (0,0), unless the first point declares an atom at t=0.
  // Beyond the last point the CDF is flat; missing mass means T=Infinity.
  function curveCDF(curve, t) {
    if (t < 0) return 0;
    let left = { t: 0, p: 0 };
    for (const right of curve.points) {
      if (t < right.t) return left.p + (right.p - left.p) * (t - left.t) / (right.t - left.t);
      left = right;
    }
    return left.p;
  }
  function distribution(model, w = 0) {
    const curves = model.curves;
    if (!Number.isFinite(w) || w < curves[0].w || w > curves.at(-1).w)
      fail("入力wがCDF曲線の範囲外です。");
    const upper = curves.find(c => c.w >= w);
    const lower = [...curves].reverse().find(c => c.w <= w);
    const ratio = lower === upper ? 0 : (w - lower.w) / (upper.w - lower.w);
    const times = [...new Set([0, ...lower.points.map(p => p.t), ...upper.points.map(p => p.t)])].sort((a,b) => a-b);
    return times.map(t => ({ t, p: curveCDF(lower, t) * (1-ratio) + curveCDF(upper, t) * ratio }));
  }
  // Pointwise bounds over the defined w interval. Linear interpolation in w
  // attains its extrema at a supplied curve, including intermediate w knots.
  // Merge piecewise-linear bounds and insert their time-axis crossings exactly.
  function envelope(model) {
    const curves=model.curves, maxTime=Math.max(1,...curves.map(c=>c.points.at(-1).t));
    const lines=curves.map(c=>{
      const points=c.points.map(p=>({...p}));
      if(points[0].t>0)points.unshift({t:0,p:0});
      if(points.at(-1).t<maxTime)points.push({t:maxTime,p:points.at(-1).p});
      return points;
    });
    function merge(a,b,choose) {
      const times=[...new Set([...a.map(p=>p.t),...b.map(p=>p.t)])].sort((x,y)=>x-y), result=[];
      let ai=0,bi=0,previous=null;
      const value=(line,i,t)=>{
        const l=line[i],r=line[i+1];
        return !r || t===l.t ? l.p : l.p+(r.p-l.p)*(t-l.t)/(r.t-l.t);
      };
      for(const t of times) {
        while(ai+1<a.length && a[ai+1].t<=t)ai++;
        while(bi+1<b.length && b[bi+1].t<=t)bi++;
        const ap=value(a,ai,t),bp=value(b,bi,t),diff=ap-bp;
        if(previous && previous.diff*diff<0) {
          const f=previous.diff/(previous.diff-diff);
          result.push({t:previous.t+(t-previous.t)*f,p:previous.ap+(ap-previous.ap)*f});
        }
        result.push({t,p:choose(ap,bp)});previous={t,ap,diff};
      }
      return result;
    }
    function bounds(list,choose) {
      if(list.length===1)return list[0];
      const mid=Math.floor(list.length/2);
      return merge(bounds(list.slice(0,mid),choose),bounds(list.slice(mid),choose),choose);
    }
    return {lower:bounds(lines,Math.min),upper:bounds(lines,Math.max),
      minW:curves[0].w,maxW:curves.at(-1).w,maxTime};
  }
  function sample(points, u) {
    if (!Number.isFinite(u) || u < 0 || u >= 1) fail("抽選値は0以上1未満です。");
    if (u >= points.at(-1).p) return Infinity;
    if (u < points[0].p) return points[0].t;
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i];
      if (u < b.p) return a.t + (b.t-a.t) * (u-a.p) / (b.p-a.p);
    }
    return Infinity;
  }
  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const api = { validateTask, curveCDF, distribution, envelope, sample, random, number };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MEPerformance = api;
})(globalThis);
