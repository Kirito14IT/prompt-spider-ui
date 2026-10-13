import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { referenceRun, customRun, stateAt, DURATION } from '../app/model.js';
const source = readFileSync(new URL('../app/prompt.txt', import.meta.url), 'utf8');

test('reference replay preserves observed final aggregates and deterministic timing', () => {
  const run = referenceRun(source);
  assert.deepEqual(run, referenceRun(source));
  assert.deepEqual(stateAt(run, DURATION).counts, { code: 137, model: 27, you: 11 });
  assert.equal(stateAt(run, DURATION).read, 175);
  assert.equal(run.total, 195);
  assert.equal(stateAt(run, 0).decisions.length, 0);
  for (const d of run.decisions) assert.equal(d.word, run.tokens[d.index].word);
});
test('approval is never rerouted to automatic code by lowering threshold', () => {
  const run = customRun('publish purchase payment delete 批准 发布 购买 删除 safe', .5);
  assert.ok(run.decisions.slice(0, -1).every(d => d.route === 'you'));
  assert.equal(run.decisions.at(-1).route, 'code');
});
test('raising threshold moves local illustrative scores away from code', () => {
  const text = 'maybe source normal uncertain well clear';
  const low = stateAt(customRun(text, .5), DURATION).counts;
  const high = stateAt(customRun(text, .99), DURATION).counts;
  assert.ok(high.code < low.code);
});
test('Chinese input is segmented, blank input is safe, and time is bounded', () => {
  const run = customRun('请批准发布这个视频，然后检查来源。');
  assert.ok(run.tokens.length > 3);
  assert.ok(run.decisions.some(d => d.route === 'you'));
  assert.equal(customRun('   ').total, 0);
  assert.equal(stateAt(run, -1).read, 0);
  assert.equal(stateAt(run, 999).read, run.tokens.length);
});
