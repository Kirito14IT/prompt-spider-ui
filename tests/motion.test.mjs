import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DURATION, referenceRun, stateAt } from '../app/model.js';
import { referencePose, flightGeometry, routeSlot } from '../app/motion.js';

const source = readFileSync(new URL('../app/prompt.txt', import.meta.url), 'utf8');
const run = referenceRun(source);

// Independent transcription of the counters visible at exact source seconds.
// Columns: time, words read, forks, code, model, human.
const OBSERVED_COUNTS = [
  [0, 1, 0, 0, 0, 0], [1, 17, 0, 0, 0, 0], [2, 37, 0, 0, 0, 0],
  [3, 56, 15, 11, 2, 2], [4, 67, 35, 26, 4, 5], [5, 77, 56, 41, 10, 5],
  [6, 86, 63, 48, 10, 5], [7, 90, 76, 61, 10, 5], [8, 91, 83, 65, 12, 6],
  [9, 91, 89, 69, 14, 6], [10, 91, 91, 71, 14, 6], [11, 95, 91, 71, 14, 6],
  [12, 114, 91, 71, 14, 6], [13, 131, 93, 72, 15, 6], [14, 151, 109, 85, 18, 6],
  [15, 162, 127, 99, 19, 9], [16, 168, 145, 113, 22, 10], [17, 172, 161, 127, 24, 10],
  [18, 175, 166, 131, 24, 11], [19, 175, 172, 135, 26, 11],
  [20, 175, 175, 137, 27, 11], [20.921, 175, 175, 137, 27, 11],
];

test('replay counters match all 22 observed source timestamps', () => {
  for (const [time, read, forks, code, model, you] of OBSERVED_COUNTS) {
    const state = stateAt(run, time);
    assert.equal(state.read, read, `${time}s read`);
    assert.equal(state.decisions.length, forks, `${time}s forks`);
    assert.deepEqual(state.counts, { code, model, you }, `${time}s routes`);
    assert.equal(code + model + you, forks, `${time}s aggregate consistency`);
  }
});

test('measured crawler stays continuous at 5 fps and passes the 10s core location', () => {
  let previous = referencePose(0);
  for (let frame = 1; frame <= Math.floor(DURATION * 5); frame++) {
    const current = referencePose(frame / 5);
    for (const key of ['x', 'y', 'scroll', 'vx', 'vy']) assert.ok(Number.isFinite(current[key]), `${key} at frame ${frame}`);
    assert.ok(Math.hypot(current.x - previous.x, current.y - previous.y) < 26, `position jump at ${frame / 5}s`);
    assert.ok(Math.hypot(current.vx, current.vy) < 130, `excess speed at ${frame / 5}s`);
    assert.ok(current.scroll >= previous.scroll, `camera moved backward at ${frame / 5}s`);
    // The spline must meet without a positional or velocity discontinuity.
    if (frame / 5 < 20.8) {
      const before = referencePose(frame / 5 - 0.0001);
      const after = referencePose(frame / 5 + 0.0001);
      assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 0.027);
      assert.ok(Math.hypot(after.vx - before.vx, after.vy - before.vy) < 0.2);
    }
    previous = current;
  }
  const core = referencePose(10);
  assert.ok(Math.abs(core.x - 234.97) < 1e-9);
  assert.ok(Math.abs(core.y - 240.30) < 1e-9);
});

test('reading, visible flights, and aggregate forks use separate clocks', () => {
  const early = stateAt(run, 1);
  assert.equal(early.read, 17);
  assert.ok(early.flights.length > 0);
  assert.equal(early.decisions.length, 0);
  assert.deepEqual(early.counts, { code: 0, model: 0, you: 0 });
  const middle = stateAt(run, 10);
  assert.equal(middle.read, 91);
  assert.equal(middle.decisions.length, 91);
  assert.equal(middle.flights.length, 0);
  assert.equal(stateAt(run,10.65).read,91);
  assert.equal(stateAt(run,10.666667).read,93);
  for (const decision of early.flights) {
    assert.ok(decision.launchTime <= 1);
    assert.ok(decision.launchTime + decision.flightDuration > 1);
    assert.ok(decision.time > 1);
  }
});

test('all word flights start at their word, move right, and slow near the arc', () => {
  for (const decision of run.decisions) {
    const camera = referencePose(decision.launchTime);
    const origin = { x: decision.origin.x, y: decision.origin.y - camera.scroll * 19.1 };
    const at = fraction => flightGeometry(decision, decision.launchTime + decision.flightDuration * fraction, origin, run.routeTotal);
    const start = at(0), finish = at(1);
    assert.deepEqual(start.point, origin, `word origin ${decision.ordinal}`);
    assert.ok(finish.end.x > origin.x + 300, `horizontal travel ${decision.ordinal}`);
    assert.ok(Math.hypot(finish.point.x - finish.end.x, finish.point.y - finish.end.y) < 1e-9);
    let previous = start.point;
    for (let sample = 1; sample <= 20; sample++) {
      const current = at(sample / 20).point;
      assert.ok(current.x >= previous.x - 1e-9, `leftward flight ${decision.ordinal} / ${sample}`);
      assert.ok(Number.isFinite(current.y));
      previous = current;
    }
    const firstQuarter = at(0.25).point.x - origin.x;
    const finalQuarter = finish.point.x - at(0.75).point.x;
    assert.ok(finalQuarter < firstQuarter * 0.04, `missing deceleration ${decision.ordinal}`);
  }
});

test('195 route slots are a complete unique permutation', () => {
  const slots = Array.from({ length: 195 }, (_, index) => routeSlot(index, 195));
  assert.equal(new Set(slots).size, 195);
  assert.deepEqual([...slots].sort((a, b) => a - b), Array.from({ length: 195 }, (_, index) => index));
  assert.equal(run.routeTotal,175);
  assert.deepEqual(run.decisions.map(d=>d.slot).sort((a,b)=>a-b),Array.from({length:175},(_,i)=>i));
});

test('seeking backward and forward returns identical state, pose, and flights', () => {
  const times = [0, 1, 3.27, 10, 11.59, 18.31, DURATION];
  const snapshot = time => {
    const state = stateAt(run, time);
    return structuredClone({
      state,
      pose: referencePose(time),
      points: state.flights.map(decision => flightGeometry(decision, time, decision.origin, run.routeTotal)),
    });
  };
  const initial = new Map(times.map(time => [time, snapshot(time)]));
  for (const time of [DURATION, 1, 18.31, 0, 10, 3.27, 11.59, 10, 0, DURATION]) {
    assert.deepEqual(snapshot(time), initial.get(time), `seek changed output at ${time}s`);
  }
  assert.deepEqual(run, referenceRun(source), 'seeking mutated the replay fixture');
});
