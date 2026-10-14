import { normalizeConfig, validateEvent, eventInput, EVENT_STATUSES, ROUTES, plainObject } from './config.js';

export const RECORD_FORMAT='prompt-spider-session/v1';
const counters=names=>Object.fromEntries(names.map(name=>[name,0]));
const byteSize=value=>new TextEncoder().encode(JSON.stringify(value)).length;
function initialState(config) { return {config:structuredClone(config),events:[],byId:new Map(),arrivals:[],counts:counters(ROUTES),statusCounts:counters(EVENT_STATUSES),status:'live',revision:0}; }
function apply(state,entry,{validate=false}={}) {
  if(entry.type==='configure') {
    const next=normalizeConfig(entry.config);
    if(state.events.length&&(next.unit!==state.config.unit||next.prompt!==state.config.prompt))throw new Error('Prompt and data unit cannot change after events arrive. Create another session.');
    state.config=next;
  } else if(entry.type==='events') {
    if(state.status!=='live')throw new Error('Recorded events cannot follow session completion.');
    if(!Array.isArray(entry.events)||!entry.events.length||entry.events.length>100)throw new Error('Log event batches must contain 1–100 events.');
    const normalized=[];
    for(const source of entry.events) {
      plainObject(source,'recorded event'); const previous=state.byId.get(source.id);
      const event=validate ? validateEvent(eventInput(source),previous,state.config) : {...source};
      event.order=previous?.order??state.events.length; event.firstAt=previous?.firstAt??entry.at; event.updatedAt=entry.at;
      if(previous){state.counts[previous.route]--;state.statusCounts[previous.status]--;}
      else {state.arrivals.push({id:event.id,at:entry.at});if(state.arrivals.length>200)state.arrivals.shift();}
      state.events[event.order]=event;state.byId.set(event.id,event);state.counts[event.route]++;state.statusCounts[event.status]++;
      normalized.push({...event});
    }
    if(validate)entry.events=normalized;
  } else if(entry.type==='complete') {
    if(state.status!=='live')throw new Error('A replay cannot complete the same session twice.');
    if(!['completed','failed','cancelled'].includes(entry.status))throw new Error('Invalid completion status in record.'); state.status=entry.status;
  } else throw new Error(`Unknown log entry type: ${entry.type}`);
  state.revision=entry.revision;
}

/** Validate untrusted replay JSON and derive aggregates from history, never from supplied counts. */
export function validateRecord(input) {
  plainObject(input,'record');
  if(input.format!==RECORD_FORMAT||input.version!==1)throw new Error('Unsupported replay format; expected prompt-spider-session/v1.');
  if(!Array.isArray(input.log)||input.log.length>100000||byteSize(input.log)>16*1024*1024)throw new Error('Replay history exceeds the 16 MiB limit or is invalid.');
  if(!Number.isFinite(input.duration)||input.duration<0||input.duration>1e9)throw new Error('Replay duration must be nonnegative seconds.');
  const initialConfig=normalizeConfig(input.initialConfig),state=initialState(initialConfig),log=[];
  let previousRevision=0,previousAt=0,normalizedBytes=2;
  for(const source of input.log) {
    plainObject(source,'log entry');
    if(!Number.isSafeInteger(source.revision)||source.revision<=previousRevision||!Number.isFinite(source.at)||source.at<previousAt||source.at>input.duration)throw new Error('Replay log must have increasing revisions and nondecreasing times within its duration.');
    const entry={revision:source.revision,at:source.at,type:source.type};
    if(entry.type==='events')entry.events=structuredClone(source.events);
    if(entry.type==='configure')entry.config=source.config;
    if(entry.type==='complete')entry.status=source.status;
    apply(state,entry,{validate:true});
    if(state.events.length>10000)throw new Error('Replay exceeds 10000 events.');
    if(entry.type==='configure')entry.config=structuredClone(state.config);
    normalizedBytes+=byteSize(entry)+1;
    if(normalizedBytes>16*1024*1024)throw new Error('Normalized replay history exceeds the 16 MiB limit.');
    log.push(entry);previousAt=entry.at;previousRevision=entry.revision;
  }
  if(!['live','completed','failed','cancelled'].includes(input.status)||input.status!==state.status)throw new Error('Replay status must match its completion history.');
  return {format:RECORD_FORMAT,version:1,id:typeof input.id==='string'?input.id:'imported',createdAt:typeof input.createdAt==='string'?input.createdAt:new Date(0).toISOString(),initialConfig,config:state.config,status:state.status,duration:input.duration,revision:Math.max(previousRevision,Number.isSafeInteger(input.revision)?input.revision:0),events:state.events,log,counts:state.counts,statusCounts:state.statusCounts,playback:{mode:'paused',position:0,speed:1,loop:false,routeFilter:'all',page:0}};
}

/** Incremental projection: RAF processes only newly reached updates and a bounded visible window. */
export class SessionProjection {
  constructor(record) { this.record=validateRecord(record);this.entries=this.record.log;this.reset(); }
  reset() { this.state=initialState(this.record.initialConfig);this.cursor=0;this.at=-1; }
  append(entries) {
    if(!Array.isArray(entries))throw new Error('Projection append expects log entries.');
    for(const source of entries){const last=this.entries.at(-1);if(last&&source.revision<=last.revision)continue;if(!Number.isFinite(source.at)||source.at<(last?.at??0))throw new Error('Appended events must be chronological.');const entry=structuredClone(source);this.entries.push(entry);this.record.duration=Math.max(this.record.duration,entry.at);}
  }
  view(at,{offset=0,limit=200}={}) {
    if(!Number.isFinite(at)||at<0)at=0;
    if(at<this.at)this.reset();
    while(this.cursor<this.entries.length&&this.entries[this.cursor].at<=at){apply(this.state,this.entries[this.cursor]);this.cursor++;}
    this.at=at; offset=Math.max(0,Math.trunc(offset)||0); limit=Math.min(200,Math.max(1,Math.trunc(limit)||200));
    const activeEvents=[];
    for(let index=this.state.arrivals.length-1;index>=0;index--){const arrival=this.state.arrivals[index];if(arrival.at<at-3.8)break;activeEvents.push(this.state.byId.get(arrival.id));}
    return {config:this.state.config,events:this.state.events.slice(offset,offset+limit),totalEvents:this.state.events.length,counts:{...this.state.counts},statusCounts:{...this.state.statusCounts},status:this.state.status,at,revision:this.state.revision,activeEvents};
  }
}
export function projectRecord(record,at) { const projection=new SessionProjection(record);const frame=projection.view(at);return {...frame,events:projection.state.events.map(event=>({...event}))}; }
