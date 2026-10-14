import test from 'node:test';
import assert from 'node:assert/strict';

let modules = {};
try { modules = { ...(await import('../lib/config.js')), ...(await import('../lib/session-store.js')), ...(await import('../lib/replay.js')) }; } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
function api() { assert.equal(typeof modules.SessionStore, 'function', 'Shared session API must be implemented'); return modules; }
function fixture(options = {}) { const { SessionStore }=api(); let time=0; const store=new SessionStore({now:()=>time,...options}); const session=store.create(); return {store,id:session.id,setTime:value=>time=value}; }

test('configuration merges colors, labels and layout without accepting unknown options',()=>{
  const {normalizeConfig}=api();
  const config=normalizeConfig({title:'Research desk',layout:'landscape',routes:{model:{label:'生成',color:'#123456'}}});
  assert.equal(config.routes.code.label,'code'); assert.equal(config.routes.model.label,'生成'); assert.equal(config.layout,'landscape');
  assert.throws(()=>normalizeConfig({layout:'arbitrary'})); assert.throws(()=>normalizeConfig({theme:{accent:'url(evil)'}}));
  assert.throws(()=>normalizeConfig(JSON.parse('{"__proto__":{}}')));
});

test('event IDs update rather than duplicate, and absent scores remain unknown',()=>{
  const {store,id,setTime}=fixture();
  setTime(1); store.updateEvents(id,[{id:'search',label:'检索资料',route:'code',status:'running'}]);
  setTime(2); store.updateEvents(id,[{id:'search',status:'completed'},{id:'write',label:'生成草稿',route:'model',score:.8}]);
  const current=store.snapshot(id);
  assert.deepEqual(current.counts,{code:1,model:1,you:0}); assert.equal(current.events.length,2);
  assert.equal(current.events[0].score,null); assert.equal(current.events[0].firstAt,1); assert.equal(current.events[0].status,'completed');
  const revision=current.revision; store.updateEvents(id,[{id:'search',status:'completed'}]); assert.equal(store.snapshot(id).revision,revision);
});

test('a rejected batch is atomic and keeps the existing history',()=>{
  const {store,id}=fixture({maxEvents:2}); store.updateEvents(id,[{id:'a',label:'A',route:'code'}]);
  const before=store.record(id);
  assert.throws(()=>store.updateEvents(id,[{id:'a',status:'completed'},{id:'b',label:'B',route:'model'},{id:'c',label:'C',route:'you'}]));
  assert.deepEqual(store.record(id),before);
  assert.throws(()=>store.updateEvents(id,[{id:'a',score:5}])); assert.deepEqual(store.record(id),before);
});

test('pause only freezes the display cursor; following live restores current time',()=>{
  const {store,id,setTime}=fixture(); setTime(2); store.control(id,{action:'pause'});
  setTime(5); store.updateEvents(id,[{id:'late',label:'Still received',route:'model'}]);
  assert.equal(store.snapshot(id).playback.position,2); assert.equal(store.snapshot(id).events.length,1);
  store.control(id,{action:'follow_live'}); assert.equal(store.snapshot(id).playback.position,5);
  store.complete(id); setTime(10); assert.equal(store.snapshot(id).duration,5);
  assert.throws(()=>store.updateEvents(id,[{id:'extra',label:'Too late',route:'you'}]));
});

test('complete preserves a session while close removes it and notifies subscribers',()=>{
  const {store,id,setTime}=fixture(); const notices=[]; store.subscribe(id,notice=>notices.push(notice));
  setTime(3); store.complete(id,'failed'); assert.equal(store.get(id).status,'failed');
  store.close(id); assert.throws(()=>store.get(id)); assert.equal(notices.at(-1).type,'closed');
});

test('replay retains status and appearance changes; imported aggregates are recomputed',()=>{
  const {projectRecord,validateRecord,SessionStore}=api(); const {store,id,setTime}=fixture();
  setTime(1); store.updateEvents(id,[{id:'one',label:'One',route:'code',status:'pending'}]);
  setTime(2); store.updateEvents(id,[{id:'one',status:'running'}]);
  setTime(3); store.configure(id,{title:'Changed',layout:'square'});
  setTime(4); store.updateEvents(id,[{id:'one',status:'completed',route:'you'}]); store.complete(id);
  const record=store.record(id);
  assert.equal(projectRecord(record,1.5).events[0].status,'pending');
  assert.equal(projectRecord(record,2.5).events[0].status,'running');
  assert.equal(projectRecord(record,3.5).config.title,'Changed');
  assert.equal(projectRecord(record,4).events[0].route,'you');
  const forged=structuredClone(record); forged.counts={code:999,model:999,you:999};
  const normalized=validateRecord(forged); assert.deepEqual(normalized.counts,{code:0,model:0,you:1});
  const restored=new SessionStore().importRecord(normalized); assert.equal(restored.status,'completed');
  for(const time of [0,1,2.5,3,4]) assert.deepEqual(projectRecord(normalized,time),projectRecord(record,time));
});

test('word events require an explicit valid token mapping',()=>{
  const {SessionStore}=api(); const store=new SessionStore(); const {id}=store.create({unit:'word',prompt:'先 检索 再 总结'});
  assert.throws(()=>store.updateEvents(id,[{id:'x',label:'检索',route:'code'}]));
  store.updateEvents(id,[{id:'x',label:'检索',route:'code',tokenIndex:1}]); assert.equal(store.snapshot(id).events[0].tokenIndex,1);
  assert.throws(()=>store.updateEvents(id,[{id:'y',label:'无效',route:'you',tokenIndex:99}]));
});

test('5000-event sessions preserve totals while per-frame projection stays bounded',()=>{
  const {SessionProjection}=api(); const {store,id,setTime}=fixture();
  for(let batch=0;batch<50;batch++){setTime(batch);store.updateEvents(id,Array.from({length:100},(_,n)=>({id:`e${batch*100+n}`,label:`Step ${batch*100+n}`,route:['code','model','you'][(batch*100+n)%3]})));}
  store.complete(id); const projection=new SessionProjection(store.record(id)); const frame=projection.view(49,{offset:4800,limit:200});
  assert.equal(frame.totalEvents,5000); assert.equal(frame.events.length,200); assert.equal(frame.events[0].id,'e4800');
  assert.equal(Object.values(frame.counts).reduce((a,b)=>a+b,0),5000); assert.ok(frame.activeEvents.length<=200);
  const frozen=structuredClone(projection.view(17)); projection.view(49); assert.deepEqual(projection.view(17),frozen);
});

test('log byte limits reject without silently trimming earlier updates',()=>{
  const {store,id}=fixture({maxLogBytes:300});
  const before=store.record(id); assert.throws(()=>store.updateEvents(id,[{id:'large',label:'Large',route:'code',detail:'x'.repeat(1000)}])); assert.deepEqual(store.record(id),before);
});

test('event animation timestamps match the log even when the clock advances within one call',()=>{
  const {SessionStore}=api();let time=0;const store=new SessionStore({now:()=>time+=.001});const {id}=store.create();
  store.updateEvents(id,[{id:'clock',label:'Clock',route:'code'}]);const record=store.record(id);
  assert.equal(record.events[0].firstAt,record.log[0].at);
});

test('viewer pagination uses 32-event pages while API pagination remains independent',()=>{
  const {store,id}=fixture();store.updateEvents(id,Array.from({length:100},(_,n)=>({id:`p${n}`,label:`Page ${n}`,route:'code'})));
  assert.equal(store.control(id,{page:3}).playback.page,3);
  assert.equal(store.control(id,{page:99}).playback.page,3);
  assert.equal(store.get(id,{offset:96,limit:32}).events.length,4);
});

test('replay expansion is limited after partial events inherit previous details',()=>{
  const {validateRecord}=api();const {store,id}=fixture();const record=store.record(id);
  record.duration=1;record.log=Array.from({length:4300},(_,n)=>({revision:n+1,at:1,type:'events',events:[n?{id:'a',status:n%2?'pending':'running'}:{id:'a',label:'A',route:'code',detail:'x'.repeat(4000)}]}));
  assert.throws(()=>validateRecord(record),/16 MiB/);
});

test('active arrivals survive until the grabbing and flight animation can finish',()=>{
  const {SessionProjection}=api();const {store,id,setTime}=fixture();setTime(1);store.updateEvents(id,[{id:'flight',label:'Flight',route:'code'}]);setTime(6);store.complete(id);
  const projection=new SessionProjection(store.record(id));assert.equal(projection.view(3.5).activeEvents[0]?.id,'flight');assert.equal(projection.view(5).activeEvents.length,0);
});
