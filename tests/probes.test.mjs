import test from 'node:test';
import assert from 'node:assert/strict';
import { probePose, drawProbes, PROBE_TIMING } from '../app/probes.js';

const body = { x: 240, y: 550 };
const event = { index: 17, launchTime: 2, word: 'provided', question: 'relevant to task?', score: 0.99, route: 'code', target: { x: 160, y: 410 }, width: 60 };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lateralToWord = pose => {
  const dx = event.target.x - body.x, dy = event.target.y - body.y;
  return ((pose.tip.x - body.x) * -dy + (pose.tip.y - body.y) * dx) / Math.hypot(dx, dy);
};

test('tip itself sweeps sideways by at least 15px before touching the word', () => {
  const start = event.launchTime - PROBE_TIMING.reach;
  const poses = Array.from({ length: 41 }, (_, index) => probePose(event, start + index / 40 * PROBE_TIMING.reach, body));
  assert.ok(Math.max(...poses.map(pose => Math.abs(lateralToWord(pose)))) >= 15);
  assert.ok(Math.abs(lateralToWord(poses[0])) < 0.01);
  assert.ok(Math.abs(lateralToWord(poses.at(-1))) < 0.01);
  // Preparation is slower than the outward stroke, then the endpoint settles.
  const speed = (fraction, step = 0.01) => distance(
    probePose(event, start + (fraction - step) * PROBE_TIMING.reach, body).tip,
    probePose(event, start + (fraction + step) * PROBE_TIMING.reach, body).tip);
  assert.ok(speed(0.5) > speed(0.05) * 3);
  assert.ok(speed(0.5) > speed(0.98) * 3);
});

test('withdrawal curls on the other side rather than retracing the outgoing tip path', () => {
  const outgoing = probePose(event, event.launchTime - PROBE_TIMING.reach / 2, body);
  const returning = probePose(event, event.launchTime + PROBE_TIMING.hold + PROBE_TIMING.retract / 2, body);
  assert.ok(lateralToWord(outgoing) * lateralToWord(returning) < 0);
  assert.ok(Math.abs(lateralToWord(outgoing) - lateralToWord(returning)) > 30);
  assert.ok(distance(outgoing.tip, returning.tip) > 35);
  assert.ok(PROBE_TIMING.reach + PROBE_TIMING.hold + PROBE_TIMING.retract <= 0.85);
});

test('reduced motion fixes all active joint and finger geometry while retaining word contact', () => {
  const a = probePose(event, event.launchTime - PROBE_TIMING.reach * 0.4, body, true);
  const b = probePose(event, event.launchTime + PROBE_TIMING.hold + PROBE_TIMING.retract * 0.4, body, true);
  for (const key of ['root', 'joints', 'tip', 'fingerOpening', 'lateral']) assert.deepEqual(a[key], b[key]);
  assert.ok(distance(a.tip, event.target) < 0.01);
});

test('grasp tip reaches the word and stays attached for the complete contact period', () => {
  const before = probePose(event, event.launchTime - 0.05, body);
  assert.equal(before.phase, 'reach');
  assert.ok(distance(before.tip, event.target) > 3);
  for (const fraction of [0, 0.25, 0.5, 0.999]) {
    const pose = probePose(event, event.launchTime + PROBE_TIMING.hold * fraction, body);
    assert.equal(pose.phase, 'hold');
    assert.equal(pose.contact, true);
    assert.ok(distance(pose.tip, event.target) < 1e-9);
  }
  const movedBody = probePose(event, event.launchTime + PROBE_TIMING.hold / 2, { x: 251, y: 557 });
  assert.ok(distance(movedBody.tip, event.target) < 1e-9);
  assert.ok(distance(movedBody.root, probePose(event, event.launchTime, body).root) > 3);
});

test('long arm folds back by more than 30px and expires after the return stroke', () => {
  const contact = probePose(event, event.launchTime, body);
  const end = event.launchTime + PROBE_TIMING.hold + PROBE_TIMING.retract;
  const retracted = probePose(event, end - 0.001, body);
  assert.equal(retracted.phase, 'retract');
  assert.ok(distance(contact.tip, retracted.tip) > 30);
  assert.ok(Math.abs(distance(retracted.tip, body) - distance(retracted.restingTip, body)) < 0.01);
  assert.ok(distance(retracted.tip, body) >= 50 && distance(retracted.tip, body) <= 65);
  const expired = probePose(event, end, body);
  assert.equal(expired.visible, false);
  assert.equal(expired.phase, 'idle');
  assert.equal(expired.opacity, 0);
});

test('reach, hold and return meet continuously and have a visible travel distance', () => {
  const start = event.launchTime - PROBE_TIMING.reach;
  const end = event.launchTime + PROBE_TIMING.hold + PROBE_TIMING.retract;
  let previous = probePose(event, start, body);
  let travel = 0;
  for (let time = start + 0.001; time < end; time += 0.001) {
    const current = probePose(event, time, body);
    assert.ok(distance(current.tip, previous.tip) < 1.3, `tip discontinuity at ${time}`);
    assert.ok(distance(current.joints[0], previous.joints[0]) < 1.3, `elbow discontinuity at ${time}`);
    travel += distance(current.tip, previous.tip);
    previous = current;
  }
  assert.ok(travel > 170);
  for (const boundary of [event.launchTime, event.launchTime + PROBE_TIMING.hold]) {
    const a = probePose(event, boundary - 0.00001, body);
    const b = probePose(event, boundary + 0.00001, body);
    assert.ok(distance(a.tip, b.tip) < 0.001);
    assert.ok(distance(a.joints[0], b.joints[0]) < 0.001);
  }
});

test('arbitrary seeks and reduced motion produce deterministic complete poses', () => {
  const at = 1.94;
  const expected = probePose(event, at, body);
  for (const time of [7, 0, 2.4, 2.08, 1.83]) probePose(event, time, body);
  assert.deepEqual(probePose(event, at, body), expected);
  const reduced = probePose(event, at, body, true);
  assert.equal(reduced.contact, true);
  assert.equal(reduced.phase, 'hold');
  assert.ok(distance(reduced.tip, event.target) < 1e-9);
  assert.equal(probePose(event, 0, body, true).visible, false);
});

test('draw isolates canvas state and retains concurrent words in the same direction', () => {
  let saves = 0, restores = 0;
  const ctx = new Proxy({
    save() { saves++; }, restore() { restores++; },
    measureText(text) { return { width: text.length * 6 }; },
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const events = Array.from({ length: 18 }, (_, index) => ({ ...event, index, launchTime: 2 + index * 0.005, target: { x: 145 + index * 2, y: 413 + index * 0.25 } }));
  const result = drawProbes(ctx, { time: 2.1, body, events });
  assert.equal(result.length, 12);
  assert.ok(result.every(pose => pose.contact && pose.target.y < body.y));
  assert.equal(saves, 1); assert.equal(restores, 1);
  assert.deepEqual(drawProbes(ctx, { time: 5, body, events }), []);
});
