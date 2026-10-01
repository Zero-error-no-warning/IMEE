/* Task and causal-link CDFs; shared by the editor, validator and Node tests. */
(function (root) {
  "use strict";
  const fail = message => { throw new Error(message); };
  function number(value, label, min, max) {
    if (!Number.isFinite(value) || value < min || value > max)
      fail(label + "が範囲外です。");
  }
  function validateTask(sim, label = "処理") {
    if (sim === undefined) return;
    if (!sim || typeof sim !== "object" || Array.isArray(sim) || typeof sim.enabled !== "boolean") fail(label + ": simulation.enabledは真偽値です。");
    for (const key of ["w", "outputW", "wInput"]) if (key in sim) fail(label + ": " + key + "は廃止されました。品質qを使用してください。");
    if (sim.q !== undefined) number(sim.q, label + ": q", 0, 1);
    if (sim.qualityRetention !== undefined) number(sim.qualityRetention, label + ": 品質保持率", 0, 1);
    const model = sim.performanceModel;
    if (sim.enabled && !model) fail(label + ": CDFが必要です。");
    if (!model) return;
    if (model.type !== "cdf" || model.degradationInput !== undefined || (model.qualityInput !== undefined && model.qualityInput !== "q")) fail(label + ": performanceModelはcdf / qualityInput:qです。");
    if (!Array.isArray(model.curves) || !model.curves.length || model.curves.length > 100) fail(label + ": CDF曲線は1〜100件です。");
    let previousQ = -1;
    for (const curve of model.curves) {
      if (!curve || typeof curve !== "object" || "w" in curve || "pInfinity" in curve) fail(label + ": 曲線にはqとpointsを指定します。未達確率は最終pから導出します。");
      number(curve.q, label + ": 曲線の入力q", 0, 1);
      if (curve.q <= previousQ) fail(label + ": 曲線のqは重複なく昇順です。");
      previousQ = curve.q;
      if (!Array.isArray(curve.points) || !curve.points.length || curve.points.length > 1000) fail(label + ": CDF点は1〜1,000件です。");
      let previousT = -1, previousP = 0;
      for (const point of curve.points) {
        if (!point || typeof point !== "object") fail(label + ": CDF点が不正です。");
        number(point.t, label + ": 所要時間", 0, 1e9);
        number(point.p, label + ": 累積確率", 0, 1);
        number(point.q, label + ": 品質保持率q", 0, 1);
        if (point.t <= previousT || point.p < previousP) fail(label + ": 時間は昇順、累積確率は単調非減少です。");
        previousT=point.t; previousP=point.p;
      }
    }
    // One curve is independent of input quality. Multiple curves cover every reachable q.
    if (model.curves.length > 1 && (model.curves[0].q !== 0 || model.curves.at(-1).q !== 1)) fail(label + ": 複数曲線は入力q=0〜1を覆ってください。");
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
  function distribution(model, q = 1) {
    const curves = model.curves;
    if (!Number.isFinite(q) || q < 0 || q > 1 || (curves.length > 1 && (q < curves[0].q || q > curves.at(-1).q)))
      fail("入力qがCDF曲線の範囲外です。");
    const upper = curves.length===1 ? curves[0] : curves.find(c => c.q >= q);
    const lower = curves.length===1 ? curves[0] : [...curves].reverse().find(c => c.q <= q);
    const ratio = lower === upper ? 0 : (q - lower.q) / (upper.q - lower.q);
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
      minQ:curves[0].q,maxQ:curves.at(-1).q,maxTime};
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
  function retention(curve, t) {
    let left={t:0,q:curve.points[0].q};
    for (const right of curve.points) {
      if (t < right.t) return left.q+(right.q-left.q)*(t-left.t)/(right.t-left.t);
      left=right;
    }
    return left.q;
  }
  function quality(model, inputQ, t) {
    const curves=model.curves;
    const lower=curves.length===1 ? curves[0] : [...curves].reverse().find(c=>c.q<=inputQ);
    const upper=curves.length===1 ? curves[0] : curves.find(c=>c.q>=inputQ);
    if (!lower || !upper) fail("入力qがCDF曲線の範囲外です。");
    const ratio=lower===upper ? 0 : (inputQ-lower.q)/(upper.q-lower.q);
    return retention(lower,t)*(1-ratio)+retention(upper,t)*ratio;
  }
  function outcome(model, inputQ, u) {
    const duration=sample(distribution(model,inputQ),u);
    return {duration, qualityRetention:Number.isFinite(duration)?quality(model,inputQ,duration):null,
      qOut:Number.isFinite(duration)?inputQ*quality(model,inputQ,duration):null};
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
  const api = { validateTask, curveCDF, distribution, envelope, sample, quality, outcome, random, number };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MEPerformance = api;
})(globalThis);
