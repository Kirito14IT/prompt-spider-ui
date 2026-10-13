import { REFERENCE_COUNTS, referencePose, timeAtCount, readAt, routeSlot } from './motion.js';
import { PROBE_TIMING } from './probes.js';

export const DURATION = 20.921;
export const ROUTES = ['code', 'model', 'you'];

export function hash(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function seeded(seed) {
  return () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function tokenize(text) {
  const sourceLines = text.replace(/\r\n?/g, '\n').split('\n');
  const tokens = [];
  sourceLines.forEach((value, line) => {
    for (const word of value.match(/\S+/gu) || []) tokens.push({ word, line });
  });
  return { sourceLines, tokens };
}

/** Reference fixtures recreate observed aggregate counts, not the author's logs. */
export function referenceRun(text) {
  const { sourceLines, tokens } = tokenize(text);
  const rng = seeded(13947);
  const cursors = new Map();
  const positions = tokens.map(token => {
    const line = sourceLines[token.line], column = line.indexOf(token.word, cursors.get(token.line) || 0);
    cursors.set(token.line, column + token.word.length);
    return { x:69 + (column + token.word.length / 2) * 7.5, y:137 + token.line * 19.1 };
  });
  const eligible = tokens.map((t,index) => ({...t,index})).filter(t => !/^<.*>$|^[-×]$|^\d+\.$/u.test(t.word)).map(t => t.index);
  const pool = Array.from({length:195},(_,i) => eligible[Math.floor(i * (eligible.length - 1) / 194)]);
  const tokenOrder = [...pool];
  const order = [];
  // The crawler probes neighboring words, so highlights spread around its body
  // instead of filling the document from top to bottom.
  while (pool.length) {
    const scanTime = timeAtCount(order.length + 1, 1), pose = referencePose(scanTime);
    const worldY = pose.y + pose.scroll * 19.1;
    let best = 0, cost = Infinity;
    pool.forEach((index,i) => {
      const p = positions[index];
      // The source creature reaches beyond its immediate footprint. Prefer a
      // surrounding ring of words, so scans involve visible arm extension.
      const radius = Math.hypot((p.x-pose.x)*.9,p.y-worldY);
      const distance = (radius-102) ** 2 + hash(index + ':' + order.length) % 2900;
      if (distance < cost) {cost = distance; best = i;}
    });
    order.push(pool.splice(best,1)[0]);
  }
  const routes = [];
  for (let i=1;i<REFERENCE_COUNTS.length;i++) {
    const a=REFERENCE_COUNTS[i-1],b=REFERENCE_COUNTS[i],bag=[];
    for(let k=3;k<=5;k++) for(let n=a[k];n<b[k];n++) bag.push(ROUTES[k-3]);
    for(let j=bag.length-1;j>0;j--){const k=Math.floor(rng()*(j+1));[bag[j],bag[k]]=[bag[k],bag[j]];}
    routes.push(...bag);
  }
  const decisions = order.slice(0,175).map((index, j) => {
    const word = tokens[index].word;
    const route = routes[j];
    const score = route === 'code' ? 0.953 + rng() * 0.045 : route === 'model' ? 0.55 + rng() * 0.39 : /ask/i.test(word) ? 0.544 : 0.57 + rng() * 0.35;
    const question = route === 'you' ? 'needs approval?' : /claim|fact|source|trace|timestamp/i.test(word) ? 'claim sourced?' : route === 'model' ? 'is this specific?' : 'relevant to task?';
    return { index, ordinal:j, slot:routeSlot(j,175), word, question, score:Math.round(score * 1000)/1000, route,
      launchTime:timeAtCount(j+1,1), flightDuration:1.08, time:timeAtCount(j+1,2), origin:positions[index] };
  });
  return { sourceLines, tokens, decisions, scanOrder:order, tokenOrder, total:195, routeTotal:175, duration:DURATION, mode:'reference', provenance:'Counts and crawler trajectory sampled from video. Per-word mapping, scores and between-frame motion reconstructed.' };
}

/** Illustrative rule scores are intentionally not presented as calibrated probabilities. */
export function customRun(text, threshold = 0.95, segmented = false) {
  const { sourceLines, tokens } = tokenize(text);
  // Chinese prompts get visible word boundaries while preserving a readable editor.
  if (!segmented && tokens.some(t => /[\u4e00-\u9fff]{5}/u.test(t.word)) && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
    const spaced = sourceLines.map(line => [...segmenter.segment(line)].map(part => part.segment).join(' ')).join('\n');
    return customRun(spaced, threshold, true);
  }
  const decisions = tokens.map((token, index) => {
    const word = token.word;
    const rng = seeded(hash(word.toLowerCase() + ':' + index));
    const approval = /approv|publish|purchas|buy|payment|credit|external|send|delete|批准|同意|发布|购买|支付|发送|删除|授权/iu.test(word);
    const uncertain = /maybe|probably|taste|smallest|well|specific|ambig|guess|perhaps|可能|大概|随便|最好|合适|炫酷/iu.test(word);
    const sourced = /source|claim|fact|trace|citation|timestamp|来源|事实|引用|证据/iu.test(word);
    const score = approval ? 0.544 + rng() * 0.25 : uncertain ? 0.6 + rng() * 0.29 : sourced ? 0.82 + rng() * 0.17 : 0.95 + rng() * 0.049;
    const rounded = Math.round(score * 1000) / 1000;
    const route = approval ? 'you' : rounded >= threshold ? 'code' : 'model';
    const time = .18 + index / Math.max(1,tokens.length-1) * (DURATION-.22);
    return { ...token,index,ordinal:index,slot:routeSlot(index,Math.max(1,Math.min(280,tokens.length))),word,question:approval?'needs approval?':sourced?'claim sourced?':uncertain?'is this specific?':'relevant to task?',score:rounded,route,time,launchTime:Math.max(.03,time-1.08),flightDuration:1.08 };
  });
  return { sourceLines, tokens, decisions, total: tokens.length, duration: DURATION, mode: 'custom', provenance: 'Local deterministic rule demonstration; no model calls or executed actions.' };
}

export function stateAt(run, elapsed, extras = {}) {
  const time = Math.max(0, Math.min(elapsed, run.duration));
  const decisions = run.decisions.filter(d => d.time <= time);
  const scanned = run.decisions.filter(d => d.launchTime <= time);
  const probeEvents = run.decisions.filter(d => d.launchTime-PROBE_TIMING.reach<=time && d.launchTime+PROBE_TIMING.hold+PROBE_TIMING.retract>=time);
  const flights = run.decisions.filter(d => d.launchTime <= time && d.launchTime + d.flightDuration > time);
  const counts = { code: 0, model: 0, you: 0 };
  for (const item of decisions) counts[item.route]++;
  const read = run.mode==='reference' ? readAt(time) : run.decisions.filter(d=>d.launchTime<=time).length;
  return { ...run,elapsed:time,decisions,scanned,probeEvents,flights,counts,read,threshold:.95,playing:false,selectedIndex:null,routeFilter:'all',reducedMotion:false,...extras };
}
