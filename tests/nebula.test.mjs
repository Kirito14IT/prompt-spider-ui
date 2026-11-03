import test from 'node:test';
import assert from 'node:assert/strict';
import { nebulaNodes, drawNebula } from '../app/nebula.js';

const rect = {x:360, y:85, w:525, h:750};
const events = Array.from({length:260}, (_,index) => ({id:`event-${index}`, label:`Read source ${index}`, route:['code','model','you'][index % 3]}));
const position = node => [node.x,node.y,node.depth,node.hub.x,node.hub.y];

test('nebula projection is deterministic, bounded at default zoom, and capped at 200 actual events', () => {
  const nodes = nebulaNodes(events, rect);
  assert.equal(nodes.length,200);
  assert.deepEqual(nodes,nebulaNodes(events,rect));
  assert.ok(nodes.every(node => events.includes(node.event)));
  assert.ok(nodes.every(node => node.visible));
  assert.ok(nodes.every(node => node.x>=rect.x && node.x<=rect.x+rect.w && node.y>=rect.y && node.y<=rect.y+rect.h));
  assert.deepEqual(nebulaNodes([],rect),[]);
  assert.deepEqual(nebulaNodes(events,{...rect,w:0}),[]);
});

test('existing event locations stay fixed when new events arrive; labels do not move nodes', () => {
  const first = nebulaNodes(events.slice(0,10),rect), next = nebulaNodes(events.slice(0,11),rect);
  for (const node of first) assert.deepEqual(position(node),position(next.find(other=>other.id===node.id)));
  const changed = {...events[0],label:'Changed after an Agent update'};
  assert.deepEqual(position(nebulaNodes([events[0]],rect)[0]),position(nebulaNodes([changed],rect)[0]));
});

test('route filter and case-insensitive label search intersect without dropping data', () => {
  const nodes = nebulaNodes(events.slice(0,40),rect,{filter:'you',query:'SOURCE 2'});
  assert.equal(nodes.length,40);
  assert.deepEqual(nodes.filter(node=>node.match).map(node=>node.id).sort(),events.slice(0,40).filter(event=>event.route==='you'&&event.label.toLowerCase().includes('source 2')).map(event=>event.id).sort());
  assert.equal(nebulaNodes([{index:2,word:'真实原词',label:'Other',route:'code'}],rect,{query:'原词'})[0].match,true);
});

test('rotation, pitch and zoom keep finite geometry and stable IDs; offscreen nodes are marked unpickable', () => {
  const baseline = nebulaNodes(events,rect);
  const moved = nebulaNodes(events,rect,{angle:1.4,pitch:.65,zoom:1.7});
  assert.deepEqual(baseline.map(node=>node.id).sort(),moved.map(node=>node.id).sort());
  assert.notDeepEqual(baseline.map(position),moved.map(position));
  assert.ok(moved.every(node=>position(node).every(Number.isFinite)));
  assert.ok(moved.some(node=>!node.visible));
  for (const node of moved.filter(node=>node.visible)) assert.ok(node.x>=rect.x&&node.x<=rect.x+rect.w&&node.y>=rect.y&&node.y<=rect.y+rect.h);
  assert.deepEqual(nebulaNodes(events,rect,{zoom:Infinity,pitch:NaN,angle:NaN}),baseline);
  assert.deepEqual(nebulaNodes(events,rect,{zoom:100,pitch:100}),nebulaNodes(events,rect,{zoom:1.7,pitch:.8}));
});

const addColorStop = () => {};
function canvasMock() {
  const calls = [];
  const ctx = new Proxy({
    calls,
    measureText:text=>({width:String(text).length*6}),
    createRadialGradient:()=>({addColorStop}),
  }, {
    get(target,key) { if (key in target) return target[key]; return (...args)=>calls.push([key,...args]); },
    set(target,key,value) { calls.push([key,value]); target[key]=value; return true; },
  });
  return ctx;
}

test('draw returns only visible matching hit targets and restores the caller canvas', () => {
  const ctx = canvasMock();
  const targets=drawNebula(ctx,events,rect,{zoom:1.7,pitch:.4,query:'source 2',filter:'you',time:4});
  assert.ok(targets.length);
  assert.ok(targets.every(node=>node.match&&node.visible&&node.event.route==='you'));
  assert.deepEqual(ctx.calls[0],['save']);
  assert.deepEqual(ctx.calls.at(-1),['restore']);
  for (const target of targets) assert.ok(ctx.calls.some(call=>call[0]==='arc'&&call[1]===target.x&&call[2]===target.y));
});

test('reduced motion freezes all time-driven paint and projection while manual camera controls remain', () => {
  const early=canvasMock(),late=canvasMock();
  const options={reducedMotion:true,flow:true,selected:'event-25',zoom:1.2,pitch:.3};
  const a=drawNebula(early,events.slice(0,40),rect,{...options,time:1});
  const b=drawNebula(late,events.slice(0,40),rect,{...options,time:100});
  assert.deepEqual(a,b);
  assert.deepEqual(early.calls,late.calls);
  const manual=drawNebula(canvasMock(),events.slice(0,40),rect,{...options,angle:1,time:100});
  assert.notDeepEqual(a.map(position),manual.map(position));
});
