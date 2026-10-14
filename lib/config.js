/** Shared, dependency-free configuration and event validation. */
export const ROUTES = Object.freeze(['code', 'model', 'you']);
export const EVENT_STATUSES = Object.freeze(['pending', 'running', 'completed', 'failed']);
export const DEFAULT_CONFIG = Object.freeze({
  title: 'Prompt Spider UI', subtitle: 'Every step, one fork', modelName: 'Agent',
  layout: 'portrait', unit: 'task', prompt: '', expectedTotal: null,
  routes: {code:{label:'code',color:'#48d7a6'},model:{label:'model',color:'#e18c78'},you:{label:'you',color:'#f4cf4d'}},
  theme: {background:'#080909',panel:'#101013',panelTop:'#19191c',border:'#29292e',text:'#e8e8e9',muted:'#9998a0',accent:'#f23c83',spider:'#48d7a6'},
});
export function plainObject(value, name='value') {
  if (!value || typeof value!=='object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw new Error(`${name} must be an object.`);
  return value;
}
function keys(value,allowed,name) { plainObject(value,name); for(const key of Object.keys(value)) if(!allowed.includes(key)) throw new Error(`Unknown ${name} field: ${key}`); }
function text(value,name,max,{empty=false}={}) { if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())) throw new Error(`${name} must be ${empty?'':'nonempty '}text up to ${max} characters.`); return value; }
function color(value,name) { if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} must be a #RRGGBB color.`); return value; }
export function normalizeConfig(patch={},base=DEFAULT_CONFIG) {
  keys(patch,Object.keys(DEFAULT_CONFIG),'configuration'); const result=structuredClone(base);
  for(const field of ['title','subtitle','modelName','prompt']) if(field in patch) result[field]=text(patch[field],field,{title:80,subtitle:160,modelName:80,prompt:12000}[field],{empty:field==='prompt'||field==='subtitle'});
  if('layout' in patch) { if(!['portrait','landscape','square'].includes(patch.layout)) throw new Error('layout must be portrait, landscape or square.'); result.layout=patch.layout; }
  if('unit' in patch) { if(!['task','word'].includes(patch.unit)) throw new Error('unit must be task or word.'); result.unit=patch.unit; }
  if('expectedTotal' in patch) { if(patch.expectedTotal!==null&&(!Number.isSafeInteger(patch.expectedTotal)||patch.expectedTotal<0||patch.expectedTotal>10000)) throw new Error('expectedTotal must be null or an integer from 0 to 10000.'); result.expectedTotal=patch.expectedTotal; }
  if('routes' in patch) {
    keys(patch.routes,ROUTES,'routes');
    for(const route of Object.keys(patch.routes)) { const value=patch.routes[route]; keys(value,['label','color'],`routes.${route}`); if('label'in value)result.routes[route].label=text(value.label,'route label',40); if('color'in value)result.routes[route].color=color(value.color,'route color'); }
  }
  if('theme' in patch) { keys(patch.theme,Object.keys(DEFAULT_CONFIG.theme),'theme'); for(const key of Object.keys(patch.theme)) result.theme[key]=color(patch.theme[key],`theme.${key}`); }
  if(result.unit==='word'&&!result.prompt.trim()) throw new Error('Word sessions require a nonempty prompt with whitespace-separated tokens.');
  return result;
}
export function tokenizePrompt(prompt) {
  const sourceLines=String(prompt).replace(/\r\n?/g,'\n').split('\n'),tokens=[];
  sourceLines.forEach((line,lineIndex)=>{ for(const word of line.match(/\S+/gu)||[]) tokens.push({word,line:lineIndex,index:tokens.length}); });
  return {sourceLines,tokens};
}
export function validateEvent(input,existing,config) {
  keys(input,['id','label','route','status','score','detail','tokenIndex','occurredAt'],'event');
  const id=text(input.id,'event.id',120); if(!/^[\p{L}\p{N}_.:-]+$/u.test(id)) throw new Error('event.id must contain letters, numbers, underscore, dash, dot or colon.');
  if(existing&&id!==existing.id) throw new Error('An event ID cannot change.');
  const event={...(existing||{id,status:'running',score:null,detail:'',tokenIndex:null,occurredAt:null}),...input};
  event.label=text(event.label,'event.label',200);
  if(!ROUTES.includes(event.route))throw new Error('event.route must be code, model or you.');
  if(!EVENT_STATUSES.includes(event.status))throw new Error('event.status must be pending, running, completed or failed.');
  if(event.score!==null&&(!Number.isFinite(event.score)||event.score<0||event.score>1))throw new Error('event.score must be null or a number from 0 to 1.');
  event.detail=text(event.detail,'event.detail',4000,{empty:true});
  if(event.occurredAt!==null)event.occurredAt=text(event.occurredAt,'event.occurredAt',120);
  if(config.unit==='word') { if(!Number.isInteger(event.tokenIndex)||event.tokenIndex<0||event.tokenIndex>=tokenizePrompt(config.prompt).tokens.length)throw new Error('Word events need a valid zero-based tokenIndex in the session prompt.'); }
  else if(event.tokenIndex!==null&&(!Number.isInteger(event.tokenIndex)||event.tokenIndex<0))throw new Error('tokenIndex must be null or a nonnegative integer.');
  return event;
}
export const eventInput = event => Object.fromEntries(['id','label','route','status','score','detail','tokenIndex','occurredAt'].filter(key=>key in event).map(key=>[key,event[key]]));
