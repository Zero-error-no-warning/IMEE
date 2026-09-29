/* Regenerate checked-in examples using the same factories as the browser menu. */
const fs = require('node:fs');
const path = require('node:path');
const sample = require('../js/sample'), L = require('../js/layout'), R = require('../js/render');
const root = path.join(__dirname, '..');
for (const [name, image, d] of [
  ['coastal', 'example', sample()],
  ['submarine', 'grouped', sample.grouped()],
  ['research', 'research', sample.research()],
]) {
  fs.writeFileSync(path.join(root, 'examples', name + '.json'), JSON.stringify(d, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'docs', image + '.svg'), R.render(d, L.layout(d, 1200), { export: true }) + '\n');
}
const tutorial = require('../js/tutorial-sample');
for (const [name, d] of [['coastal', tutorial()], ['submarine', tutorial.grouped()], ['research', tutorial.research()]])
  fs.writeFileSync(path.join(root, 'examples/tutorial', name + '.json'), JSON.stringify(d, null, 2) + '\n');
const llm = tutorial();
delete llm.views.main.filters.planned;
const example = JSON.stringify(llm, null, 2);
fs.writeFileSync(path.join(root, 'examples/llm-example.json'), example + '\n');
const spec = path.join(root, 'docs/llm-json-generation.md');
fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace(/```json\n[\s\S]*?\n```/, '```json\n' + example + '\n```'));
