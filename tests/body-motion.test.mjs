import test from 'node:test';
import assert from 'node:assert/strict';
import {heartbeatAt,legPose} from '../app/spider.js';

test('red core has two visible heartbeat peaks and a quiet recovery',()=>{
  const a=heartbeatAt(.86*.16),b=heartbeatAt(.86*.38),rest=heartbeatAt(.86*.78);
  assert.ok(a.size-rest.size>5);assert.ok(b.size-rest.size>3);
  assert.ok(a.glow>rest.glow*2);assert.ok(a.intensity>rest.intensity+.25);
  assert.deepEqual(heartbeatAt(.14),heartbeatAt(.14));
  assert.deepEqual(heartbeatAt(0,true),heartbeatAt(40,true));
});

test('short feet lift and sweep visibly even while the body pauses',()=>{
  const poses=Array.from({length:61},(_,i)=>legPose({time:i/60,speed:0,side:1,index:3}));
  const xs=poses.map(p=>p.foot.x),ys=poses.map(p=>p.foot.y);
  assert.ok(Math.max(...xs)-Math.min(...xs)>8);
  assert.ok(Math.max(...ys)-Math.min(...ys)>14);
  assert.ok(poses.some(p=>p.lift>.9));assert.ok(poses.some(p=>p.lift===0));
  for(let i=1;i<poses.length;i++)assert.ok(Math.hypot(poses[i].foot.x-poses[i-1].foot.x,poses[i].foot.y-poses[i-1].foot.y)<5);
  assert.deepEqual(legPose({time:1,reducedMotion:true}),legPose({time:7,reducedMotion:true}));
});
