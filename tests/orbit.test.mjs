import test from 'node:test';
import assert from 'node:assert/strict';
import { orbitNodes } from '../app/orbit.js';

const rect = {x:360,y:85,w:525,h:750};
const events = Array.from({length:500},(_,i)=>({id:`event-${i}`,label:`Task ${i}`,route:['code','model','you'][i%3]}));
test('orbital projection is bounded, deterministic and never creates extra events',()=>{
  const nodes=orbitNodes(events,rect,{angle:1.5});
  assert.equal(nodes.length,200);
  assert.deepEqual(nodes,orbitNodes(events,rect,{angle:1.5}));
  for(const n of nodes){assert.ok(events.includes(n.event));assert.ok(n.x>=rect.x&&n.x<=rect.x+rect.w);assert.ok(n.y>=rect.y&&n.y<=rect.y+rect.h);}
  assert.deepEqual(orbitNodes([],rect),[]);
});
test('rotation preserves event identity; search and route filtering intersect',()=>{
  const before=orbitNodes(events,rect),after=orbitNodes(events,rect,{angle:1});
  assert.deepEqual(before.map(n=>n.id).sort(),after.map(n=>n.id).sort());
  assert.notDeepEqual(before.map(n=>n.x),after.map(n=>n.x));
  const nodes=orbitNodes(events,rect,{filter:'you',query:'TASK 49'});
  assert.deepEqual(nodes.filter(n=>n.match).map(n=>n.event.id).sort(),events.slice(-200).filter(e=>e.route==='you'&&e.label.toLowerCase().includes('task 49')).map(e=>e.id).sort());
});
