import { drawOrbit } from './orbit.js';
import { referencePose, arcX, flightGeometry } from './motion.js';
import { drawSpider } from './spider.js';
import { drawProbes } from './probes.js';
const WIDTH = 1080;
const HEIGHT = 1350;
const MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
const PALETTE = {
  background: '#080909', panel: '#101013', panelTop: '#19191c', border: '#29292e',
  white: '#e8e8e9', muted: '#77767d', dim: '#3a3a41',
  code: '#48d7a6', model: '#e18c78', you: '#f4cf4d', pink: '#f23c83',
};
const ROUTES = ['code', 'model', 'you'];
const QUESTIONS = ['relevant to task?', 'claim sourced?', 'is this specific?', 'needs approval?', 'retry or stop', 'which file', 'owner assigned?'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const fract = value => value - Math.floor(value);
const random = seed => fract(Math.sin(seed * 127.1 + 311.7) * 43758.5453123);
const routeColor = route => PALETTE[route] || PALETTE.muted;

/** A deterministic, resolution-independent recreation of the reference terminal. */
export class Renderer {
  constructor(canvas, { onSelect } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.onSelect = onSelect;
    this.regions = [];
    this.layout = null;
    this.lastState = null;
    this.dpr = 0;
    this.handleClick = event => {
      const index = this.hitTest(event.clientX, event.clientY);
      if (index !== null && this.onSelect) this.onSelect(index);
    };
    canvas.addEventListener('click', this.handleClick);
    this.resize();
  }

  resize() {
    const next = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    if (next === this.dpr && this.canvas.width === WIDTH * next) return;
    this.dpr = next;
    this.canvas.width = Math.round(WIDTH * next);
    this.canvas.height = Math.round(HEIGHT * next);
    this.ctx.setTransform(next, 0, 0, next, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
  }

  font(size = 12, weight = 400) {
    this.ctx.font = `${weight} ${size}px ${MONO}`;
  }

  text(text, x, y, color = PALETTE.white, size = 12, weight = 400, align = 'left') {
    this.font(size, weight);
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.fillText(String(text), x, y);
    this.ctx.textAlign = 'left';
  }

  line(x1, y1, x2, y2, color, width = 1) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }

  panel(x, y, w, h, title, right = '') {
    const c = this.ctx;
    c.fillStyle = PALETTE.panel; c.fillRect(x, y, w, h);
    c.fillStyle = PALETTE.panelTop; c.fillRect(x + 1, y + 1, w - 2, 20);
    c.strokeStyle = PALETTE.border; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, w - 1, h - 1);
    this.text(`▪ ${title}`, x + 8, y + 15, '#838188', 10);
    if (right) this.text(right, x + w - 8, y + 15, '#727077', 10, 400, 'right');
  }

  makeLayout(state) {
    if (this.layout?.source === state.sourceLines && this.layout?.tokens === state.tokens) return this.layout;
    const lines = state.sourceLines || [];
    const tokens = state.tokens || [];
    this.font(12.5);
    const charWidth = this.ctx.measureText('M').width;
    const maxColumns = state.mode === 'reference' ? 10000 : Math.floor(281 / charWidth);
    const rows = [];
    const placements = [];
    const byLine = new Map();
    tokens.forEach((token, index) => {
      const sourceLine = Math.max(0, Number(token.line) || 0);
      if (!byLine.has(sourceLine)) byLine.set(sourceLine, []);
      byLine.get(sourceLine).push({ ...token, index });
    });
    lines.forEach((line, lineIndex) => {
      const value = String(line).replace(/\t/g, '  ');
      const chunks = [];
      let cursor = 0;
      while (cursor < value.length || chunks.length === 0) {
        let end = Math.min(value.length, cursor + maxColumns);
        if (end < value.length) {
          const previousSpace = value.lastIndexOf(' ', end);
          if (previousSpace > cursor + 15) end = previousSpace + 1;
        }
        chunks.push({ start: cursor, end, text: value.slice(cursor, end), row: rows.length });
        rows.push({ text: value.slice(cursor, end), line: lineIndex, continuation: cursor > 0 });
        cursor = end;
        if (cursor === value.length) break;
      }
      let tokenCursor = 0;
      for (const token of byLine.get(lineIndex) || []) {
        let char = value.indexOf(token.word, tokenCursor);
        if (char < 0) char = tokenCursor;
        tokenCursor = char + token.word.length;
        const chunk = chunks.find(part => char >= part.start && char < part.end) || chunks[chunks.length - 1];
        const column = char - chunk.start;
        placements[token.index] = {
          index: token.index, word: token.word, row: chunk.row, line: lineIndex,
          x: 69 + column * charWidth, w: Math.max(charWidth * token.word.length, 5),
        };
      }
    });
    // Empty sourceLines is useful to callers building an interactive custom demo.
    if (!rows.length && tokens.length) {
      let row = 0; let column = 0;
      tokens.forEach((token, index) => {
        if (column + token.word.length > maxColumns) { row++; column = 0; }
        rows[row] ||= { text: '', line: row, continuation: false };
        const word = String(token.word);
        rows[row].text += `${column ? ' ' : ''}${word}`;
        placements[index] = { index, word, row, line: row, x: 69 + column * charWidth, w: word.length * charWidth };
        column += word.length + 1;
      });
    }
    this.layout = { source: state.sourceLines, tokens: state.tokens, rows, placements, charWidth };
    return this.layout;
  }

  render(state) {
    this.resize();
    this.lastState = state;
    this.regions = [];
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalAlpha = 1; c.shadowBlur = 0; c.lineWidth = 1;
    c.fillStyle = PALETTE.background; c.fillRect(0, 0, WIDTH, HEIGHT);
    const decisions = state.decisions || [];
    const byToken = new Map((state.scanned || decisions).map(decision => [decision.index, decision]));
    const counts = state.counts || { code: 0, model: 0, you: 0 };
    const layout = this.makeLayout(state);
    const latest = decisions[decisions.length - 1];
    const activeIndex = state.selectedIndex ?? latest?.index ?? 0;
    const active = layout.placements[activeIndex];
    // The creature and camera follow the measured source trajectory. Selecting
    // a word changes inspection only, so it cannot teleport the creature.
    const maxScroll = Math.max(0, layout.rows.length - 37);
    const progressScroll = Math.floor(clamp((state.read || 0) / Math.max(1, state.total || 195), 0, 1) * (maxScroll + 3));
    const pose = referencePose(state.elapsed || 0);
    const scroll = state.mode === 'reference' ? pose.scroll : progressScroll;
    this.motionState = {...pose,scroll,flightCount:(state.flights || []).length};
    const baseline = state.mode === 'reference' ? 137 : 108;
    const tokenPoint = placement => ({
      x: placement ? placement.x + placement.w * .5 : 210,
      y: placement ? baseline + (placement.row - scroll) * 19.1 : 230,
    });
    this.drawHeader(state, decisions, counts);
    if (this.networkView === 'orbit') {
      const nodes = drawOrbit(c, decisions, {x:360,y:85,w:525,h:750}, {time:state.elapsed,angle:this.orbitAngle || 0,reducedMotion:state.reducedMotion,filter:state.routeFilter,query:this.searchQuery,selected:state.selectedIndex,theme:{background:PALETTE.background,text:PALETTE.white,muted:'#9998a0'},colors:PALETTE});
      this.regions.push(...nodes.map(n=>({x:n.x-10,y:n.y-10,w:20,h:20,index:n.event.index})));
    } else this.drawWeb(state, layout, byToken, scroll, tokenPoint);
    this.drawEditor(state, layout, byToken, scroll);
    if (this.networkView !== 'orbit') this.drawFlights(state, layout, tokenPoint);
    this.drawRouteCards(state, counts, latest);
    this.drawRoutingParticles(state);
    this.drawSpider(state, pose, latest, layout, tokenPoint);
    this.drawStream(state, decisions);
    this.drawStats(state, decisions, counts);
    this.drawConfidence(state, decisions);
    this.drawWordGrid(state, layout, byToken);
    this.drawSphere(state);
    this.drawThink(state, counts);
    this.drawStatus(state, counts, decisions.length, scroll);
  }

  drawHeader(state, decisions, counts) {
    const c = this.ctx;
    this.text('PROMPT SPIDER', 16, 30, '#f4f4f4', 22, 700);
    this.text('// EVERY WORD, ONE FORK', 198, 30, PALETTE.pink, 22, 700);
    this.text('every word becomes a typed question · code takes the sure ones,', 16, 48, '#79797f', 10.6);
    this.text('sonnet 5.5 the hard ones, you the risky ones.', 16, 61, '#79797f', 10.6);
    const columns = [
      ['words', state.read || 0, '#ededed'], ['forks', decisions.length, PALETTE.pink],
      ['code', counts.code || 0, PALETTE.code], ['sonnet', counts.model || 0, PALETTE.model],
      ['you', counts.you || 0, PALETTE.you],
    ];
    columns.forEach(([label, value, color], i) => {
      const x = 699 + i * 77;
      this.text(label, x, 20, '#79777e', 9);
      this.text(value, x, 44, color, 20, 700);
    });
    c.globalAlpha = 1;
  }

  drawEditor(state, layout, byToken, scroll) {
    const c = this.ctx;
    c.fillStyle = '#101013'; c.fillRect(16, 70, 344, 760);
    c.fillStyle = '#19191c'; c.fillRect(16, 70, 344, 24);
    ['#ff685e', '#ffc54c', '#43c982'].forEach((color, i) => {
      c.fillStyle = color; c.beginPath(); c.arc(30 + i * 14, 83, 4.4, 0, Math.PI * 2); c.fill();
    });
    this.text('studio.prompt', 78, 87, '#ededed', 12);
    this.text(`ln ${Math.floor(scroll) + 1}`, 350, 87, '#77767d', 10, 400, 'right');
    c.save(); c.beginPath(); c.rect(16, 94, 344, 735); c.clip();
    this.font(12.5);
    const baseline = state.mode === 'reference' ? 137 : 108;
    for (let row = Math.max(0,Math.floor(scroll)-2); row < Math.min(layout.rows.length, scroll + 39); row++) {
      const item = layout.rows[row];
      const y = baseline + (row - scroll) * 19.1;
      if (!item.continuation) this.text(String(item.line + 1).padStart(2, ' '), 40, y, '#45434a', 9.5);
      const isTag = /^\s*<\/?/.test(item.text);
      this.text(item.text, 69, y, isTag ? '#aa8f91' : '#dddddf', 12.5);
    }
    for (const placement of layout.placements) {
      if (!placement || placement.row < scroll - 2 || placement.row > scroll + 38) continue;
      const y = baseline + (placement.row - scroll) * 19.1;
      const decision = byToken.get(placement.index);
      const selected = state.selectedIndex === placement.index;
      const visible = !decision || state.routeFilter === 'all' || !state.routeFilter || state.routeFilter === decision.route;
      const route = decision?.route;
      const selectedColor = routeColor(route);
      c.globalAlpha = visible ? 1 : .24;
      if (decision && state.elapsed-decision.launchTime<.18) {
        c.fillStyle=PALETTE.pink;c.fillRect(placement.x-1,y-12.2,placement.w+2,16.2);
        this.text(placement.word,placement.x,y,'#190a13',12.5);
      } else if (decision) {
        const filled = random(placement.index + 22) > .29;
        if (filled) {
          c.fillStyle = selectedColor;
          c.globalAlpha *= .87;
          c.fillRect(placement.x - 1.1, y - 12.2, placement.w + 2.2, 16.2);
          c.globalAlpha = visible ? 1 : .24;
          this.text(placement.word, placement.x, y, '#10191a', 12.5);
        } else {
          c.strokeStyle = selectedColor; c.lineWidth = .9;
          c.strokeRect(placement.x - 1.2, y - 12.2, placement.w + 2.3, 16.2);
          this.text(placement.word, placement.x, y, '#e6e7e5', 12.5);
        }
      }
      if (selected) {
        c.globalAlpha = 1; c.strokeStyle = '#ffffff'; c.lineWidth = 1.4;
        c.strokeRect(placement.x - 3, y - 15, placement.w + 6, 21);
      }
      this.regions.push({ index: placement.index, x: placement.x - 3, y: y - 15, w: placement.w + 6, h: 20 });
    }
    c.globalAlpha = 1;
    const fade = c.createLinearGradient(0, 800, 0, 831);
    fade.addColorStop(0, 'rgba(16,16,19,0)'); fade.addColorStop(1, '#101013');
    c.fillStyle = fade; c.fillRect(16, 800, 344, 31);
    c.restore();
    this.line(16, 829.5, 360, 829.5, '#25252a');
  }

  drawWeb(state, layout, byToken, scroll, tokenPoint) {
    const c = this.ctx, elapsed = Number(state.elapsed) || 0;
    const total = state.mode === 'reference' ? state.routeTotal || 175 : Math.max(1,Math.min(280,state.total || 195));
    const routed = new Map((state.decisions || []).map(d => [d.slot,d]));
    c.save(); c.beginPath(); c.rect(359,68,536,781); c.clip();
    // A fine fan exists before any word is read. Independent low-frequency
    // control-point motion gives the strands a soft local sway.
    // pairings avoid the two thick diagonal bundles of the previous version.
    for (let i=0;i<440;i++) {
      const wave=state.reducedMotion?0:Math.sin(elapsed*(.75+random(i+5)*.6)+random(i+94)*6.28)*10;
      const waveB=state.reducedMotion?0:Math.sin(elapsed*(.65+random(i+19)*.7)+random(i+201)*6.28)*9;
      const sy = 90 + random(i+83)*739+wave*.24;
      const ey = 70 + random(i+217)*778;
      const ex = arcX(ey), inset = 130 + random(i+11)*36;
      const bend = (random(i+31)-.5)*110;
      c.beginPath(); c.moveTo(360,sy);
      c.bezierCurveTo(490+random(i+41)*28+wave*.4,sy+bend+wave,ex-inset-30+waveB*.3,sy*.62+ey*.38+(ey-450)*.11+waveB,ex-inset,ey+(ey-450)*.18);
      c.strokeStyle = `rgba(149,153,159,${.0875+random(i+8)*.094})`;
      c.lineWidth = .6; c.stroke();
    }
    for (let slot=0;slot<total;slot++) {
      const d = routed.get(slot), y = 70+(slot+.5)/total*778, x=arcX(y);
      const sx=x-153-random(slot+51)*20, sy=y+(y-450)*.18+(random(slot+33)-.5)*7;
      const visible = !d || !state.routeFilter || state.routeFilter==='all' || state.routeFilter===d.route;
      const selected = d && state.selectedIndex===d.index;
      const color = d ? routeColor(d.route) : '#55505a';
      c.globalAlpha = d ? visible ? .88 : .12 : .35;
      this.line(sx,sy,x,y,color,selected?2.1:d?1.3:.65);
      if (d && visible) {
        const phase=state.reducedMotion?.5:fract(elapsed*.21+random(slot+61));
        c.globalAlpha=.7; c.fillStyle=phase>.95?'#e9fff8':color;
        c.fillRect(sx+(x-sx)*phase-1,sy+(y-sy)*phase-1,2.8,2);
        if (elapsed-d.time<.25) {c.fillStyle='#ecfff5';c.fillRect(sx-2,sy-2,4,4);}
      }
      c.globalAlpha=1;
      if(slot%8===0) {
        c.save();c.translate(x+8,y);c.rotate((450-y)/450*.48);
        this.text(QUESTIONS[slot%QUESTIONS.length],0,2,'#77717b',8.5);c.restore();
      }
    }
    for(let ring=0;ring<2;ring++) {
      c.beginPath();for(let y=60;y<=858;y+=4){const x=arcX(y)+ring*52;y===60?c.moveTo(x,y):c.lineTo(x,y);}
      c.strokeStyle=ring?'#3c3a42':'#67616b';c.lineWidth=ring?1:.6;c.stroke();
    }
    for(let y=74;y<845;y+=8){const x=arcX(y);this.line(x+1,y,x+5,y+(y-450)*.006,'#55515a',.5);}
    // Measured white scanner: one upward sweep, wrapping at the top.
    const scanY=70+((674.24494-39.14435*elapsed)%778+778)%778,scanX=arcX(scanY)+54;
    c.save();c.translate(scanX,scanY);c.rotate(-Math.atan(.0015*(scanY-450)));
    this.line(0,-42,0,42,'#dadcda',3.1);this.line(5,-25,5,25,'#787980',.8);
    this.text('p',10,-34,'#b5b3b9',9);c.restore();c.restore();
  }

  drawFlights(state, layout, tokenPoint) {
    const c=this.ctx, total=state.mode==='reference'?state.routeTotal || 175:Math.max(1,Math.min(280,state.total || 195));
    this.flightPoints=[];
    c.save();c.beginPath();c.rect(17,94,878,754);c.clip();
    for(const d of state.flights || []) {
      if(state.routeFilter && state.routeFilter!=='all' && state.routeFilter!==d.route)continue;
      const placement=layout.placements[d.index];
      let origin=tokenPoint(placement);
      if(state.mode==='reference' && d.origin) {
        origin={x:d.origin.x,y:d.origin.y-referencePose(d.launchTime).scroll*19.1};
      }
      origin={x:clamp(origin.x,72,342),y:clamp(origin.y-4,100,816)};
      const f=flightGeometry(d,state.elapsed,origin,total);
      const {point,controlA,controlB,end,progress}=f;
      this.flightPoints.push({index:d.index,...f});
      c.globalAlpha=Math.min(1,progress*12,(1-progress)*9);
      c.beginPath();c.moveTo(origin.x,origin.y);
      c.bezierCurveTo(controlA.x,controlA.y,controlB.x,controlB.y,end.x,end.y);
      c.strokeStyle='rgba(242,60,131,.44)';c.lineWidth=.85;c.stroke();
      const label=String(d.word).slice(0,18);this.font(12.5);
      const w=c.measureText(label).width+8;
      c.fillStyle=PALETTE.pink;c.fillRect(point.x-w/2,point.y-10,w,20);
      this.text(label,point.x-w/2+4,point.y+4,'#210b16',12.5);
      this.text(String(d.question).slice(0,26),point.x-w/2,point.y-14,'#b9b4bc',8.1);
      this.regions.push({index:d.index,x:point.x-w/2,y:point.y-10,w,h:20});
      if(progress>.72) {
        c.strokeStyle='rgba(242,60,131,.3)';c.lineWidth=1;
        c.beginPath();c.arc(end.x,end.y,5+(progress-.72)*16,0,Math.PI*2);c.stroke();
      }
      c.globalAlpha=1;
    }
    for(const d of state.scanned || []) {
      const age=state.elapsed-d.launchTime-d.flightDuration;
      if(age<0 || age>.44)continue;
      if(state.routeFilter && state.routeFilter!=='all' && state.routeFilter!==d.route)continue;
      const y=70+(d.slot+.5)/total*778,x=arcX(y)+52,p=age/.44;
      c.globalAlpha=.65*(1-p);c.strokeStyle=PALETTE.pink;c.lineWidth=1.1;
      c.beginPath();c.arc(x,y,8+p*8,0,Math.PI*2);c.stroke();
    }
    c.globalAlpha=1;
    c.restore();
  }

  drawSpider(state, pose, decision, layout, tokenPoint) {
    const c=this.ctx;
    const events=(state.probeEvents || []).map(d=>{
      const placement=layout.placements[d.index];
      const point=tokenPoint(placement);
      return {...d,target:{x:point.x,y:point.y-4},width:placement?.w || d.word.length*7.5};
    }).filter(d=>d.target.x>68 && d.target.x<352 && d.target.y>110 && d.target.y<809
      && Math.hypot(d.target.x-pose.x,d.target.y-pose.y)<210);
    c.save();c.beginPath();c.rect(17,95,342,735);c.clip();
    this.probePoints=drawProbes(c,{time:state.elapsed || 0,body:pose,events,reducedMotion:state.reducedMotion});
    this.bodyMotion=drawSpider(c,{...pose,time:state.elapsed || 0,activeProbes:this.probePoints.length,reducedMotion:state.reducedMotion,phase:0});
    c.restore();
  }

  drawRoutingParticles(state) {
    const c=this.ctx,total=state.routeTotal || Math.max(1,Math.min(280,state.total));
    c.save();c.beginPath();c.rect(766,70,136,779);c.clip();
    for(const d of state.decisions || []) {
      const age=state.elapsed-d.time;
      if(age<0 || age>.7)continue;
      if(state.routeFilter && state.routeFilter!=='all' && state.routeFilter!==d.route)continue;
      const sy=70+(d.slot+.5)/total*778,sx=arcX(sy)+52;
      const ty=185+ROUTES.indexOf(d.route)*235;
      for(let k=0;k<2;k++) {
        const p=(age-k*.065)/.56;if(p<0 || p>1)continue;
        const x=sx+(892-sx)*p,y=sy+(ty-sy)*p+(random(d.index+k+70)-.5)*18*Math.sin(p*Math.PI);
        c.globalAlpha=Math.min(1,p*12,(1-p)*7);c.fillStyle=routeColor(d.route);
        c.fillRect(x-1.8,y-1.8,3.6,3.6);
        c.globalAlpha*=.2;c.fillRect(x-3.8,y-3.8,7.6,7.6);
      }
    }
    c.restore();
  }

  drawRouteCards(state, counts, latest) {
    const c = this.ctx;
    const descriptions = ['no model call', 'the model thinks', 'your call'];
    const labels = [`if p ≥ ${Number(state.threshold || .95).toFixed(2)}`, `p < ${Number(state.threshold || .95).toFixed(2)}`, 'approval only'];
    ROUTES.forEach((route, i) => {
      const x = 905; const y = 110 + i * 235; const w = 160; const h = 150;
      const color = routeColor(route);
      const recent = (state.decisions || []).some(d=>d.route===route && state.elapsed-d.time<.22);
      if (recent) {
        c.strokeStyle = color; c.globalAlpha = .25; c.lineWidth = 2;
        c.strokeRect(x - 7, y - 7, w + 14, h + 14); c.globalAlpha = 1;
      }
      c.fillStyle = '#09090b'; c.fillRect(x, y, w, h);
      c.strokeStyle = color; c.lineWidth = recent ? 2 : 1; c.strokeRect(x + .5, y + .5, w - 1, h - 1);
      c.fillStyle = color; c.fillRect(x + 1, y + 1, w - 2, 19);
      this.text(labels[i], x + 7, y + 14, '#0b1110', 10, 700);
      this.text(`→ ${route === 'model' ? 'sonnet 5.5' : route}`, x + 12, y + 48, '#f2f0f1', 16, 700);
      this.text(counts[route] || 0, x + w - 11, y + 97, color, 42, 700, 'right');
      this.text(descriptions[i], x + 10, y + 138, '#7e7b83', 10);
    });
  }

  drawStream(state, decisions) {
    const c = this.ctx;
    this.panel(16, 858, 680, 212, 'decision stream', 'word · typed question · p · route');
    const filtered = decisions.filter(item => !state.routeFilter || state.routeFilter === 'all' || item.route === state.routeFilter);
    const last = filtered.slice(-9);
    c.save(); c.beginPath(); c.rect(17, 879, 678, 190); c.clip();
    last.forEach((item, index) => {
      const y = 896 + index * 19.4;
      const selected = state.selectedIndex === item.index;
      if (index === last.length - 1 || selected) {
        c.fillStyle = selected ? 'rgba(242,60,131,.18)' : 'rgba(242,60,131,.07)';
        c.fillRect(18, y - 14, 676, 19);
      }
      this.text(`${Number(item.time || 0).toFixed(2).padStart(5, '0')}s`, 26, y, '#8e8991', 10.5);
      const word = String(item.word).slice(0, 19);
      this.font(11);
      const tagWidth = this.ctx.measureText(word).width + 7;
      c.fillStyle = PALETTE.pink; c.fillRect(95, y - 11.5, tagWidth, 15);
      this.text(word, 98, y, '#140a11', 11);
      this.text(String(item.question || QUESTIONS[item.index % QUESTIONS.length]).slice(0, 29), 260, y, '#e8e5e9', 10.6);
      this.text(`p ${Number(item.score).toFixed(3)}`, 470, y, routeColor(item.route), 10.6);
      this.text(`→ ${item.route === 'model' ? 'sonnet 5.5' : item.route}`, 562, y, routeColor(item.route), 10.6);
      this.regions.push({ index: item.index, x: 18, y: y - 15, w: 676, h: 19 });
    });
    if (!last.length) this.text('awaiting the first fork_', 26, 905, '#77737b', 11);
    c.restore();
  }

  drawStats(state, decisions, counts) {
    const c = this.ctx;
    this.panel(712, 858, 352, 212, 'routed this session');
    this.text(decisions.length, 731, 946, PALETTE.pink, 64, 700);
    this.text(`of ${state.total || 195} words in the prompt`, 731, 968, '#85818a', 11);
    ROUTES.forEach((route, i) => {
      const y = 995 + i * 22;
      this.text(route === 'model' ? 'sonnet 5.5' : route, 731, y, '#e0dde3', 11);
      c.fillStyle = '#29282e'; c.fillRect(830, y - 8, 170, 7);
      const width = Math.max(counts[route] ? 4 : 0, 170 * (counts[route] || 0) / Math.max(1, decisions.length));
      c.fillStyle = routeColor(route); c.fillRect(830, y - 8, width, 7);
      if (width > 4) { c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(830 + width - 4, y - 8, 4, 7); }
      this.text(counts[route] || 0, 1050, y, routeColor(route), 11, 400, 'right');
    });
  }

  drawConfidence(state, decisions) {
    const c = this.ctx;
    this.panel(16, 1080, 256, 236, 'confidence · last 40', 'p');
    const values = decisions.slice(-40);
    const x = 26; const y = 1110; const w = 236; const h = 151;
    for (let i = 0; i <= 3; i++) this.line(x, y + i * h / 3, x + w, y + i * h / 3, '#24222a', .65);
    const thresholdY = y + h * (1 - (state.threshold || .95));
    c.setLineDash([3, 3]); this.line(x, thresholdY, x + w, thresholdY, '#408f75', .8); c.setLineDash([]);
    this.text(`${Number(state.threshold || .95).toFixed(2)} → code`, x + w - 1, thresholdY + 2, '#469b7d', 8.6, 400, 'right');
    if (values.length) {
      const points = values.map((item, index) => ({ x: x + index / 39 * w, y: y + (1 - item.score) * h, item }));
      c.beginPath(); c.moveTo(points[0].x, y + h);
      points.forEach(point => c.lineTo(point.x, point.y));
      c.lineTo(points[points.length - 1].x, y + h); c.closePath();
      const fade = c.createLinearGradient(0, y, 0, y + h);
      fade.addColorStop(0, 'rgba(237,48,126,.06)'); fade.addColorStop(1, 'rgba(237,48,126,.16)');
      c.fillStyle = fade; c.fill();
      c.beginPath(); points.forEach((point, index) => index ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y));
      c.strokeStyle = PALETTE.pink; c.lineWidth = 1.35; c.stroke();
      points.forEach(point => { c.fillStyle = routeColor(point.item.route); c.fillRect(point.x - 1.7, point.y - 1.7, 3.4, 3.4); });
    }
    const avg = decisions.length ? decisions.reduce((sum, item) => sum + item.score, 0) / decisions.length : 0;
    this.text(`avg ${avg.toFixed(3)}`, 26, 1301, '#f2f0f2', 11, 700);
  }

  drawWordGrid(state, layout, byToken) {
    const c = this.ctx;
    this.panel(282, 1080, 256, 236, 'words read', 'one dot = one word');
    const total = state.total || 195;
    const columns = 16; const rows = Math.ceil(total / columns);
    const spacingX = 14.5; const spacingY = Math.min(16.5, 171 / Math.max(1, rows - 1));
    const routed=new Map((state.decisions || []).map(d=>[d.index,d]));
    for (let index = 0; index < total; index++) {
      const tokenIndex = state.tokenOrder?.[index] ?? index;
      const decision = routed.get(tokenIndex);
      const read = byToken.has(tokenIndex);
      const x = 298 + index % columns * spacingX;
      const y = 1113 + Math.floor(index / columns) * spacingY;
      c.fillStyle = decision ? routeColor(decision.route) : read ? PALETTE.pink : '#29292f';
      c.globalAlpha = !state.routeFilter || state.routeFilter === 'all' || !decision || decision.route === state.routeFilter ? 1 : .19;
      c.beginPath(); c.arc(x, y, read || decision ? 3.8 : 2.5, 0, Math.PI * 2); c.fill();
      if (state.selectedIndex === tokenIndex) { c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.stroke(); }
      if (tokenIndex < layout.placements.length) this.regions.push({ index: tokenIndex, x: x - 6, y: y - 7, w: 12, h: 14 });
    }
    c.globalAlpha = 1;
    this.text(`${state.read || 0} / ${total}`, 292, 1301, '#f2f0f2', 11, 700);
  }

  drawSphere(state) {
    const c = this.ctx;
    this.panel(548, 1080, 256, 236, 'prompt coverage', '3d');
    const cx = 676; const cy = 1197; const radius = 88;
    const time = state.reducedMotion ? .4 : (state.elapsed || 0) * .085;
    const coverage = state.mode === 'reference'
      ? clamp((state.decisions || []).length / 175,0,1)
      : clamp((state.read || 0) / Math.max(1, state.total || 195), 0, 1);
    const points = [];
    for (let i = 0; i < 486; i++) {
      const yy = 1 - (i + .5) / 486 * 2;
      const ring = Math.sqrt(1 - yy * yy);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      const xx = Math.cos(a) * ring; const zz = Math.sin(a) * ring;
      const x = xx * Math.cos(time) + zz * Math.sin(time);
      const z = -xx * Math.sin(time) + zz * Math.cos(time);
      const tiltY = yy * .96 - z * .27;
      const tiltZ = yy * .27 + z * .96;
      points.push({ x, y: tiltY, z: tiltZ, index: i });
    }
    points.sort((a, b) => a.z - b.z);
    for (const point of points) {
      const perspective = 1 + point.z * .11;
      const x = cx + point.x * radius * perspective;
      const y = cy + point.y * radius * perspective;
      const covered = random(point.index + 100) < coverage;
      c.globalAlpha = (.25 + (point.z + 1) * .37) * (covered ? 1 : .55);
      c.fillStyle = point.index % 5 === 0 && covered ? '#87c6ba' : '#c4c3cb';
      const size = point.z > .5 ? 2.6 : 1.9;
      c.fillRect(x - size / 2, y - size / 2, size, size * .65);
      if (point.z > .3 && point.index % 31 === 0) {
        c.fillStyle = 'rgba(125,189,170,.18)'; c.fillRect(x - 3, y - 3, 6, 5);
      }
    }
    c.globalAlpha = 1;
    const marker = (label, angle, elevation) => {
      const x = cx + Math.cos(angle + time) * radius * Math.cos(elevation);
      const y = cy + Math.sin(elevation) * radius;
      c.fillStyle = '#ec5b91'; c.fillRect(x - 2, y - 2, 4, 4);
      this.text(label, x + 5, y + 3, '#e0d9df', 9);
    };
    marker('claims', 2.3, -.25); marker('approval', -.38, .48);
    this.text(`${Math.round(coverage * 100)}% covered`, 558, 1301, '#f2f0f2', 11, 700);
  }

  drawThink(state, counts) {
    const c = this.ctx;
    this.panel(814, 1080, 250, 236, 'who had to think');
    ROUTES.forEach((route, i) => {
      const y = 1119 + i * 49;
      c.fillStyle = routeColor(route); c.fillRect(826, y - 10, 4, 34);
      this.text(route === 'model' ? 'sonnet 5.5' : route, 838, y, routeColor(route), 12, 700);
      this.text(`${counts[route] || 0} ${['if-statements', 'hard calls', 'approvals'][i]}`, 838, y + 18, '#e7e2e7', 11);
    });
    this.text('the model only thinks', 826, 1286, '#f4eff4', 11, 700);
    this.text("where code can't decide", 826, 1303, PALETTE.pink, 11, 700);
  }

  drawStatus(state, counts, forks, scroll) {
    const c = this.ctx;
    c.fillStyle = '#161619'; c.fillRect(0, 1326, 1080, 24);
    this.line(0, 1326.5, 1080, 1326.5, '#25252a');
    this.text(`spider@studio · 16 legs · 22 tentacles · ~/studio.prompt · ln ${Math.floor(scroll) + 1}`, 15, 1342, '#7b7880', 10.5);
    this.text(`forks ${forks} · code ${counts.code || 0} · sonnet ${counts.model || 0} · you ${counts.you || 0}`, 1065, 1342, PALETTE.pink, 10.5, 400, 'right');
  }

  hitTest(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (clientX - rect.left) / rect.width * WIDTH;
    const y = (clientY - rect.top) / rect.height * HEIGHT;
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const region = this.regions[i];
      if (x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h) return region.index;
    }
    return null;
  }

  destroy() {
    this.canvas.removeEventListener('click', this.handleClick);
    this.onSelect = null;
    this.regions = [];
    this.lastState = null;
  }
}
