import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVE_LAYOUTS, livePose, eventPlacement, hitEvent, resolveCursor, parseSseFrames } from '../app/live-layout.js';

test('live layouts keep the scene, details and hit regions inside each stage', () => {
  assert.deepEqual(Object.values(LIVE_LAYOUTS).map(x => [x.width, x.height]), [[1080, 1350], [1600, 900], [1080, 1080]]);
  for (const layout of Object.values(LIVE_LAYOUTS)) {
    for (const box of [layout.scene, layout.stats, layout.stream].filter(Boolean)) {
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= layout.width && box.y + box.h <= layout.height);
    }
    const event = { id: 'step-1', order: 1, label: 'Read source', route: 'code' };
    const placed = eventPlacement(layout, [event]);
    assert.equal(hitEvent(placed, placed[0].x + 3, placed[0].y), event.id);
    assert.equal(hitEvent(placed, 0, 0), null);
  }
});

test('live spider movement is continuous across loops and long sessions', () => {
  const layout = LIVE_LAYOUTS.portrait;
  for (const time of [0, 16, 32, 100000]) {
    const before = livePose(layout, time - 0.001), after = livePose(layout, time + 0.001);
    assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1);
    assert.ok(Number.isFinite(after.vx + after.vy));
  }
  assert.deepEqual(livePose(layout, 1, true), livePose(layout, 2000, true));
});

test('cursor follows server anchor without resetting live data on animation loops', () => {
  const record = { elapsed: 9000, duration: 9000, status: 'live', playback: {mode:'live',position:9000,speed:1,loop:false} };
  assert.equal(resolveCursor(record, 1200), 9001.2);
  record.playback.mode='paused'; assert.equal(resolveCursor(record,1200),9000);
  record.status='completed'; record.duration=10; record.playback={mode:'playing',position:9,speed:2,loop:true};
  assert.equal(resolveCursor(record, 1000), 1);
  record.status='live';record.source='replay';record.playback.loop=false;
  assert.equal(resolveCursor(record, 10000),10,'an imported live snapshot has no producer or growing duration');
});

test('authenticated SSE parser retains fragmented frames and ignores comments', () => {
  let partial = parseSseFrames(': keepalive\n\ndata: {"type":"up');
  assert.equal(partial.messages.length,0);
  const frames=parseSseFrames(partial.rest+'date"}\r\n\r\ndata: {"type":"control"}\n\n');
  assert.deepEqual(frames.messages,[{type:'update'},{type:'control'}]);
  assert.equal(frames.rest,'');
});
