import { normalizeConfig, validateEvent, EVENT_STATUSES, ROUTES } from './config.js';
import { RECORD_FORMAT, validateRecord } from './replay.js';

const counts=names=>Object.fromEntries(names.map(name=>[name,0]));
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const terminal=status=>['completed','failed','cancelled'].includes(status);
/** In-memory authoritative sessions. Only explicit export operations write to disk. */
export class SessionStore {
  constructor({now=()=>performance.now()/1000,maxEvents=10000,maxLogBytes=16*1024*1024,maxSessions=20}={}) {this.now=now;this.maxEvents=maxEvents;this.maxLogBytes=maxLogBytes;this.maxSessions=maxSessions;this.sessions=new Map();}
  _session(id) {const session=this.sessions.get(id);if(!session)throw new Error('Session not found or closed. Create a new session or import a saved replay.');return session;}
  _elapsed(session) {return session.status==='live'&&!session.imported?Math.max(0,this.now()-session.started):session.duration;}
  _playback(session) {
    const elapsed=this._elapsed(session),pb=session.playback;let position=pb.position;
    if(pb.mode==='live')position=elapsed;
    else if(pb.mode==='playing'){position+=Math.max(0,this.now()-pb.anchor)*pb.speed;if(pb.loop&&elapsed>0&&(terminal(session.status)||session.imported))position%=elapsed;else position=Math.min(elapsed,position);}
    return {mode:pb.mode,position,speed:pb.speed,loop:pb.loop,routeFilter:pb.routeFilter,page:pb.page};
  }
  _meta(session) {const elapsed=this._elapsed(session);return {id:session.id,createdAt:session.createdAt,config:structuredClone(session.config),status:session.status,source:session.imported?'replay':'agent',duration:elapsed,elapsed,revision:session.revision,counts:{...session.counts},statusCounts:{...session.statusCounts},totalEvents:session.events.length,playback:this._playback(session),serverTime:Date.now()};}
  _notify(session,type,entry) {const payload={type,meta:this._meta(session),...(entry?{entry:structuredClone(entry)}:{})};for(const listener of session.listeners){try{listener(payload);}catch{/* A disconnected observer cannot fail a committed update. */}}}
  _entry(session,entry) {entry={...entry,revision:session.revision+1,at:entry.at??this._elapsed(session)};const size=bytes(entry)+1;if(session.logBytes+size>this.maxLogBytes)throw new Error('Session history reached its log-byte limit. Export and close this session before starting another.');return {entry,size};}
  _commit(session,prepared) {session.revision=prepared.entry.revision;session.log.push(prepared.entry);session.logBytes+=prepared.size;this._notify(session,'update',prepared.entry);}
  create(config={}) {
    if(this.sessions.size>=this.maxSessions)throw new Error(`At most ${this.maxSessions} sessions can be open. Export and close one first.`);
    const normalized=normalizeConfig(config),id=crypto.randomUUID(),started=this.now();
    this.sessions.set(id,{id,createdAt:new Date().toISOString(),initialConfig:structuredClone(normalized),config:normalized,status:'live',started,duration:0,revision:0,events:[],byId:new Map(),log:[],logBytes:2,counts:counts(ROUTES),statusCounts:counts(EVENT_STATUSES),playback:{mode:'live',position:0,anchor:started,speed:1,loop:false,routeFilter:'all',page:0},listeners:new Set(),imported:false});
    return this.snapshot(id);
  }
  get(id,{offset=0,limit=50}={}) {
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>200)throw new Error('Pagination requires offset >= 0 and limit from 1 to 200.');
    const session=this._session(id);return {...this._meta(session),events:structuredClone(session.events.slice(offset,offset+limit)),pagination:{offset,limit,total:session.events.length,hasMore:offset+limit<session.events.length}};
  }
  record(id) {const session=this._session(id);return {format:RECORD_FORMAT,version:1,id:session.id,createdAt:session.createdAt,initialConfig:structuredClone(session.initialConfig),config:structuredClone(session.config),status:session.status,duration:this._elapsed(session),revision:session.revision,events:structuredClone(session.events),log:structuredClone(session.log),counts:{...session.counts},statusCounts:{...session.statusCounts},playback:this._playback(session)};}
  snapshot(id) {const session=this._session(id);return {...this.record(id),...this._meta(session)};}
  configure(id,patch) {
    const session=this._session(id),config=normalizeConfig(patch,session.config);
    if(session.events.length&&(config.unit!==session.config.unit||config.prompt!==session.config.prompt))throw new Error('Prompt and data unit cannot change after events arrive. Create another session.');
    if(JSON.stringify(config)===JSON.stringify(session.config))return this.get(id);
    const prepared=this._entry(session,{type:'configure',config});session.config=config;this._commit(session,prepared);return this.get(id);
  }
  updateEvents(id,inputs) {
    const session=this._session(id);if(session.status!=='live'||session.imported)throw new Error('This session is a completed or imported replay; create a new live session to report events.');
    if(!Array.isArray(inputs)||!inputs.length||inputs.length>100)throw new Error('Send 1–100 events per call.');
    const at=this._elapsed(session),pending=new Map(),updates=[];let nextOrder=session.events.length;
    for(const input of inputs){const previous=pending.get(input?.id)||session.byId.get(input?.id);const event=validateEvent(input,previous,session.config);if(previous&&Object.keys(input).every(key=>JSON.stringify(input[key])===JSON.stringify(previous[key])))continue;event.order=previous?.order??nextOrder++;event.firstAt=previous?.firstAt??at;event.updatedAt=at;pending.set(event.id,event);updates.push({...event});}
    if(!updates.length)return this.get(id);
    if(nextOrder>this.maxEvents)throw new Error(`Session reached its ${this.maxEvents}-event limit. Export and close it; no history has been removed.`);
    const prepared=this._entry(session,{type:'events',events:updates,at});
    for(const event of updates){const previous=session.byId.get(event.id);if(previous){session.counts[previous.route]--;session.statusCounts[previous.status]--;}session.events[event.order]=event;session.byId.set(event.id,event);session.counts[event.route]++;session.statusCounts[event.status]++;}
    this._commit(session,prepared);return this.get(id);
  }
  complete(id,status='completed') {
    const session=this._session(id);if(!terminal(status))throw new Error('Completion status must be completed, failed or cancelled.');
    if(session.status!=='live'){if(session.status===status)return this.get(id);throw new Error('Session is already completed.');}
    const prepared=this._entry(session,{type:'complete',status});session.duration=prepared.entry.at;session.status=status;session.playback={...session.playback,mode:'paused',position:session.duration,anchor:this.now(),loop:false};this._commit(session,prepared);return this.get(id);
  }
  control(id,command={}) {
    const session=this._session(id);if(!command||typeof command!=='object'||Array.isArray(command))throw new Error('Playback command must be an object.');
    for(const key of Object.keys(command))if(!['action','position','speed','loop','routeFilter','page'].includes(key))throw new Error(`Unknown playback option: ${key}`);
    const pb={...session.playback,...this._playback(session),anchor:this.now()},elapsed=this._elapsed(session);
    if(command.action!==undefined&&!['play','pause','seek','restart','follow_live'].includes(command.action))throw new Error('Unknown playback action.');
    if('position'in command&&(!Number.isFinite(command.position)||command.position<0))throw new Error('position must be nonnegative seconds.');
    if('speed'in command){if(!Number.isFinite(command.speed)||command.speed<.5||command.speed>4)throw new Error('speed must be from 0.5 to 4.');pb.speed=command.speed;}
    if('loop'in command){if(typeof command.loop!=='boolean')throw new Error('loop must be boolean.');if(command.loop&&session.status==='live'&&!session.imported)throw new Error('Loop playback is available after a session completes.');pb.loop=command.loop;}
    if('routeFilter'in command){if(!['all',...ROUTES].includes(command.routeFilter))throw new Error('Invalid route filter.');pb.routeFilter=command.routeFilter;}
    if('page'in command){if(!Number.isInteger(command.page)||command.page<0)throw new Error('page must be a nonnegative integer.');pb.page=Math.min(command.page,Math.max(0,Math.ceil(session.events.length/32)-1));}
    if(command.action==='pause'||command.action==='seek')pb.mode='paused';
    if(command.action==='seek'){if(!('position'in command))throw new Error('seek needs position in seconds.');pb.position=Math.min(command.position,elapsed);}
    if(command.action==='play'){pb.mode='playing';if(pb.position>=elapsed)pb.position=0;}
    if(command.action==='restart'){pb.position=0;pb.mode='playing';}
    if(command.action==='follow_live'){if(session.imported)throw new Error('An imported replay has no live producer.');pb.mode=session.status==='live'?'live':'paused';pb.position=elapsed;}
    session.playback=pb;session.revision++;this._notify(session,'control');return this.get(id);
  }
  list() {return [...this.sessions.values()].map(session=>this._meta(session));}
  subscribe(id,listener) {const session=this._session(id);session.listeners.add(listener);return ()=>session.listeners.delete(listener);}
  close(id) {const session=this._session(id);this._notify(session,'closed');session.listeners.clear();this.sessions.delete(id);return {id,closed:true};}
  importRecord(input) {
    const record=validateRecord(input),created=this.create(record.initialConfig),session=this._session(created.id);
    Object.assign(session,{config:record.config,status:record.status,duration:record.duration,revision:record.revision,events:record.events,byId:new Map(record.events.map(event=>[event.id,event])),log:record.log,logBytes:record.log.reduce((total,entry)=>total+bytes(entry)+1,2),counts:record.counts,statusCounts:record.statusCounts,imported:true,playback:{...record.playback,mode:'paused',position:0,anchor:this.now()}});
    return this.snapshot(session.id);
  }
}
