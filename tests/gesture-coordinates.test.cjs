const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp } = require('./dom-helper.cjs');
const sample = require('./fixtures/mission.cjs');

// jsdom does not lay out SVG. Supply browser screen matrices for the actual
// centered viewBox / CSS scaling / page and container scrolling cases.
const cases = [
  { name: 'short SVG centered by min-height', left: 12, top: 150, scale: 1, insetY: 118, scrollY: 0 },
  { name: 'CSS scaling and viewBox letterboxing', left: 24, top: 130, scale: 0.75, insetY: 82, scrollY: 0 },
  { name: 'page offset and scrolled diagram', left: 18, top: -45, scale: 1.25, insetY: 0, scrollY: 72 },
];
function screen(a, config) {
  const svg = a.$('#timeline'), scroll = a.$('#canvas-scroll');
  scroll.scrollTop = config.scrollY;
  const matrix = () => ({
    a: config.scale, b: 0, c: 0, d: config.scale,
    e: config.left,
    f: config.top + config.insetY - scroll.scrollTop * config.scale,
  });
  svg.getBoundingClientRect = () => ({
    left: config.left, top: config.top - scroll.scrollTop * config.scale,
    width: 1050 * config.scale, height: 700,
  });
  svg.getScreenCTM = () => {
    const m = matrix();
    return { ...m, inverse: () => ({a: 1/m.a, b: 0, c: 0, d: 1/m.d, e: -m.e/m.a, f: -m.f/m.d}) };
  };
  return (x, y) => {
    const m = matrix();
    return { clientX: m.a*x + m.e, clientY: m.d*y + m.f };
  };
}
function near(actual, expected) { assert(Math.abs(actual-expected)<1e-7, `${actual} != ${expected}`); }
for (const config of cases) {
  test(`marquee paint and selected States agree under ${config.name}`, async t => {
    const a=await openApp(sample()); t.after(()=>a.close());
    const toScreen=screen(a,config), g=a.w.MELayout.layout(a.savedDoc(),1050);
    const first=g.states.get('s0'), last=g.states.get('s1');
    const start={x:first.x-10,y:first.y-10}, end={x:last.x+10,y:last.y+10};
    a.event(a.$('#timeline'),'pointerdown',toScreen(start.x,start.y));
    a.event(a.w,'pointermove',toScreen(end.x,end.y));
    const box=a.$('#gesture-preview'); assert(box);
    near(+box.getAttribute('x'),start.x); near(+box.getAttribute('y'),start.y);
    near(+box.getAttribute('width'),end.x-start.x); near(+box.getAttribute('height'),end.y-start.y);
    a.event(a.$('#timeline'),'pointerup',toScreen(end.x,end.y));
    assert.deepEqual([...a.d.querySelectorAll('.state.selected')].map(el=>el.dataset.id),['s0','s1']);
    assert.equal(a.$('#gesture-preview'),null); assert.deepEqual(a.errors,[]);
  });
  test(`connection preview and target time agree under ${config.name}`, async t => {
    const a=await openApp(sample()); t.after(()=>a.close());
    const toScreen=screen(a,config), g=a.w.MELayout.layout(a.savedDoc(),1050);
    const from=g.states.get('jam-output-42'), end={x:g.vp.x(49),y:g.tasks.get('transmit').from.y};
    a.event(a.$('[data-id="jam-output-42"]'),'pointerdown',{...toScreen(from.x,from.y),altKey:true});
    a.event(a.w,'pointermove',toScreen(end.x,end.y));
    const line=a.$('#gesture-preview'); assert(line);
    const coordinates=line.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
    [from.x,from.y,end.x,end.y].forEach((value,i)=>near(coordinates[i],value));
    a.event(a.$('[data-id="transmit"]'),'pointerup',toScreen(end.x,end.y));
    const link=a.savedDoc().causalLinks.at(-1);
    assert.equal(link.source.id,'jam-output-42'); assert.equal(link.target.type,'junction'); assert.equal(link.target.id,'j-transmit'); assert.equal(link.propagation.duration,7); assert.equal(a.w.ME.causalArrivalTime(a.savedDoc(),link),49);
    assert.equal(a.$('#gesture-preview'),null); assert.deepEqual(a.errors,[]);
  });
}
test('State move preview and committed time agree after a scroll during the gesture',async t=>{
  const a=await openApp(sample());t.after(()=>a.close());
  const config=cases[1],toScreen=screen(a,config),g=a.w.MELayout.layout(a.savedDoc(),1050),from=g.states.get('s0');
  a.event(a.$('[data-id="s0"]'),'pointerdown',toScreen(from.x,from.y));
  a.$('#canvas-scroll').scrollTop=45;
  const end={x:from.x+2*g.vp.scale,y:from.y};
  a.event(a.w,'pointermove',toScreen(end.x,end.y));
  const values=a.$('#gesture-preview').getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
  [from.x,from.y,end.x,end.y].forEach((value,i)=>near(values[i],value));
  a.event(a.$('[data-id="s0"]'),'pointerup',toScreen(end.x,end.y));
  assert.equal(a.savedDoc().states[0].time,4);assert.deepEqual(a.errors,[]);
});
