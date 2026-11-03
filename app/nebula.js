// A deterministic route field, not a similarity graph. No physics or remote data.
const ROUTES = ['code', 'model', 'you'];
const DEFAULT_COLORS = {code:'#48d7a6', model:'#e18c78', you:'#f4cf4d'};
const DEFAULT_THEME = {background:'#080909', text:'#e8e8e9', muted:'#9998a0'};
const TAU = Math.PI * 2;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const fract = value => value - Math.floor(value);

function hash(value) {
  let h = 2166136261;
  for (const ch of String(value)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ h >>> 16, 0x85ebca6b);
  h = Math.imul(h ^ h >>> 13, 0xc2b2ae35);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

function camera(rect, {angle = 0, pitch = 0, zoom = 1} = {}) {
  const yaw = finite(angle, 0), tilt = clamp(finite(pitch, 0), -.8, .8) - .18;
  const scale = clamp(finite(zoom, 1), 1, 1.7);
  const radius = Math.max(1, Math.min(rect.w - 48, rect.h - 116)) * .43 * scale;
  const cy = rect.y + rect.h * .51, cx = rect.x + rect.w / 2;
  const ca = Math.cos(yaw), sa = Math.sin(yaw), cp = Math.cos(tilt), sp = Math.sin(tilt);
  return point => {
    const x = point.x * ca + point.z * sa, yawZ = point.z * ca - point.x * sa;
    const y = point.y * cp - yawZ * sp, z = point.y * sp + yawZ * cp;
    const perspective = 1 / (1 - z * .23);
    return {x:cx + x * radius * perspective, y:cy + y * radius * perspective, depth:z, perspective};
  };
}

function usable(rect) {
  return rect && ['x','y','w','h'].every(key => Number.isFinite(rect[key])) && rect.w >= 64 && rect.h >= 100;
}

function inside(point, rect) {
  return point.x >= rect.x + 9 && point.x <= rect.x + rect.w - 9 && point.y >= rect.y + 42 && point.y <= rect.y + rect.h - 49;
}

/** Projection retains offscreen points with visible=false; only visible points are pickable. */
export function nebulaNodes(events, rect, {angle = 0, pitch = 0, zoom = 1, filter = 'all', query = ''} = {}) {
  if (!usable(rect)) return [];
  const project = camera(rect, {angle, pitch, zoom});
  const needle = String(query ?? '').trim().toLocaleLowerCase();
  return (Array.isArray(events) ? events : []).filter(event => event && ROUTES.includes(event.route)).slice(-200).map(event => {
    const id = event.id ?? event.index;
    const band = ROUTES.indexOf(event.route) - 1;
    const longitude = hash(`longitude:${id}`) * TAU;
    const latitude = band * .74 + (hash(`latitude:${id}`) - .5) * .46;
    const spread = .83 + hash(`radius:${id}`) * .14;
    const point = {x:Math.cos(longitude) * Math.cos(latitude) * spread, y:Math.sin(latitude) * spread, z:Math.sin(longitude) * Math.cos(latitude) * spread};
    const projected = project(point);
    const hub = project({x:0, y:band * .23, z:0});
    const label = String(event.word ?? event.displayLabel ?? event.label ?? '');
    return {event, id, ...projected, hub, radius:2.1 + (projected.depth + 1) * 1.65,
      visible:inside(projected, rect), match:(filter === 'all' || event.route === filter) && (!needle || label.toLocaleLowerCase().includes(needle))};
  }).sort((a,b) => a.depth - b.depth);
}

function alpha(hex, opacity) {
  return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${opacity})`;
}

function ring(ctx, project, coordinate, color, opacity, width = .75) {
  ctx.beginPath();
  for (let index = 0; index <= 80; index++) {
    const point = project(coordinate(index / 80 * TAU));
    if (index) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y);
  }
  ctx.strokeStyle = alpha(color, opacity); ctx.lineWidth = width; ctx.stroke();
}

function halo(ctx, point, color, radius, opacity) {
  const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
  gradient.addColorStop(0, alpha(color, opacity)); gradient.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, TAU); ctx.fill();
}

/** Draws into an existing renderer; elapsed time is the sole animation clock. */
export function drawNebula(ctx, events, rect, {
  time = 0, angle = 0, pitch = 0, zoom = 1, reducedMotion = false,
  filter = 'all', query = '', selected = null, hovered = null, flow = true,
  theme = DEFAULT_THEME, colors = DEFAULT_COLORS,
} = {}) {
  if (!usable(rect)) return [];
  const t = {...DEFAULT_THEME, ...theme}, palette = {...DEFAULT_COLORS, ...colors};
  const clock = reducedMotion ? 0 : finite(time, 0);
  const yaw = finite(angle, 0) + clock * .055;
  const nodes = nebulaNodes(events, rect, {angle:yaw, pitch, zoom, filter, query});
  const project = camera(rect, {angle:yaw, pitch, zoom});
  const focusId = hovered ?? selected;
  const focus = nodes.find(node => node.id === focusId && node.match);
  const hubs = ROUTES.map((route, index) => ({route, ...project({x:0, y:(index - 1) * .23, z:0})}));
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.setLineDash([]);
  ctx.fillStyle = t.background; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = '11px Consolas, monospace';
  ctx.fillStyle = t.muted; ctx.fillText('NEBULA / ROUTE FIELD', rect.x + 14, rect.y + 24);
  ctx.textAlign = 'right'; ctx.fillText('3D', rect.x + rect.w - 14, rect.y + 24); ctx.textAlign = 'left';

  // Longitude rails make rotation readable; latitude bands retain the route colors.
  for (const longitude of [0, Math.PI / 2]) {
    ring(ctx, project, phase => ({x:Math.cos(phase) * Math.cos(longitude), y:Math.sin(phase), z:Math.cos(phase) * Math.sin(longitude)}), t.muted, .10);
  }
  ROUTES.forEach((route, index) => {
    const latitude = (index - 1) * .74, cy = Math.sin(latitude), radius = Math.cos(latitude);
    ring(ctx, project, phase => ({x:Math.cos(phase) * radius, y:cy, z:Math.sin(phase) * radius}), palette[route], focus && focus.event.route !== route ? .07 : .28);
  });

  // A spoke encodes route membership only. It never invents edges between events.
  for (const node of nodes) {
    const emphasized = focus && focus.event.route === node.event.route;
    const active = node.id === focusId;
    const opacity = !node.match ? .018 : focus && !emphasized ? .035 : active ? .85 : emphasized ? .28 : .115;
    ctx.beginPath(); ctx.moveTo(node.hub.x, node.hub.y); ctx.lineTo(node.x, node.y);
    ctx.strokeStyle = alpha(palette[node.event.route], opacity); ctx.lineWidth = active ? 1.35 : .65; ctx.stroke();
    if (flow && node.match && (active || hash(`flow:${node.id}`) < .34)) {
      const phase = fract(clock * (.14 + hash(`speed:${node.id}`) * .07) + hash(node.id));
      const x = node.hub.x + (node.x - node.hub.x) * phase, y = node.hub.y + (node.y - node.hub.y) * phase;
      ctx.fillStyle = alpha(palette[node.event.route], focus && !emphasized ? .08 : .75);
      ctx.beginPath(); ctx.arc(x, y, active ? 2.8 : 1.5, 0, TAU); ctx.fill();
    }
  }

  for (const hub of hubs) {
    const color = palette[hub.route], dim = focus && focus.event.route !== hub.route;
    halo(ctx, hub, color, 21, dim ? .07 : .23);
    ctx.fillStyle = color; ctx.globalAlpha = dim ? .25 : .9;
    ctx.beginPath(); ctx.arc(hub.x, hub.y, 4.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hub.x, hub.y, 8, 0, TAU); ctx.stroke();
    ctx.font = '10px Consolas, monospace'; ctx.fillText(hub.route, hub.x + 13, hub.y + 4);
  }

  let labels = 0;
  for (const node of nodes) {
    if (!node.visible) continue;
    const active = node.id === focusId, emphasized = !focus || focus.event.route === node.event.route;
    const color = palette[node.event.route];
    const opacity = !node.match ? .07 : !emphasized ? .15 : .47 + (node.depth + 1) * .24;
    ctx.globalAlpha = 1;
    if (active) halo(ctx, node, color, 19, .5);
    ctx.fillStyle = alpha(color, opacity);
    ctx.beginPath(); ctx.arc(node.x, node.y, active ? node.radius + 2 : node.radius, 0, TAU); ctx.fill();
    if (active) {
      ctx.strokeStyle = t.text; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(node.x, node.y, node.radius + 5.5, 0, TAU); ctx.stroke();
    } else if (node.depth > .3 && node.match && emphasized) {
      ctx.fillStyle = alpha(t.text, .7); ctx.beginPath(); ctx.arc(node.x - .6, node.y - .6, .85, 0, TAU); ctx.fill();
    }
    if (node.match && emphasized && (active || labels++ < (String(query ?? '').trim() ? 12 : 8))) {
      const label = String(node.event.word ?? node.event.displayLabel ?? node.event.label ?? '');
      let shown = label.length > 22 ? label.slice(0,21) + '…' : label;
      ctx.font = '10px Consolas, monospace';
      while (shown.length > 1 && ctx.measureText(shown).width > rect.w - 32) shown = shown.slice(0,-2) + '…';
      const width = ctx.measureText(shown).width;
      const x = clamp(node.x + 10, rect.x + 10, rect.x + rect.w - width - 10);
      const y = clamp(node.y - 9, rect.y + 46, rect.y + rect.h - 55);
      ctx.fillStyle = t.background; ctx.fillRect(x - 3, y - 11, width + 6, 15);
      ctx.fillStyle = active ? t.text : color; ctx.fillText(shown, x, y);
    }
  }

  ctx.globalAlpha = 1; ctx.font = '10px Consolas, monospace'; ctx.fillStyle = t.muted;
  const pickable = nodes.filter(node => node.visible && node.match);
  const total = nodes.length;
  ctx.fillText(total ? `${pickable.length} / ${total} NODES` : 'WAITING FOR EVENTS', rect.x + 14, rect.y + rect.h - 31);
  ctx.font = '9px Consolas, monospace'; ctx.fillText('LINKS = ROUTE MEMBERSHIP', rect.x + 14, rect.y + rect.h - 15);
  ctx.restore();
  return pickable;
}
