// Analytic projection: bounded work, stable IDs, no physics engine or remote data.
const ROUTES = ['code', 'model', 'you'];
function hash(value) {
  let h = 2166136261;
  for (const ch of String(value)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function orbitNodes(events, rect, {angle = 0, filter = 'all', query = ''} = {}) {
  const needle = query.trim().toLocaleLowerCase();
  return events.filter(e => ROUTES.includes(e.route)).slice(-200).map(e => {
    const id = e.id ?? e.index;
    const band = ROUTES.indexOf(e.route);
    const phase = hash(id) * Math.PI * 2 + angle;
    const radius = .56 + hash(`radius:${id}`) * .38;
    const depth = Math.sin(phase);
    return {event:e, id, depth,
      x:rect.x + rect.w * .5 + Math.cos(phase) * rect.w * .42 * radius,
      y:rect.y + rect.h * (.27 + band * .23) + depth * rect.h * .10 * radius,
      match:(filter === 'all' || e.route === filter) && (!needle || String(e.word ?? e.displayLabel ?? e.label).toLocaleLowerCase().includes(needle))};
  }).sort((a,b) => a.depth - b.depth);
}

export function drawOrbit(ctx, events, rect, {time = 0, angle = 0, reducedMotion = false, filter = 'all', query = '', selected = null, theme, colors} = {}) {
  const nodes = orbitNodes(events, rect, {angle:angle + (reducedMotion ? 0 : time * .045), filter, query});
  const cx = rect.x + rect.w * .5;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.fillStyle = theme.background; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.font = '11px Consolas, monospace';
  ctx.fillStyle = theme.muted; ctx.fillText('ORBIT / DRAG TO ROTATE', rect.x + 14, rect.y + 24);
  ROUTES.forEach((route, band) => {
    const cy = rect.y + rect.h * (.27 + band * .23);
    ctx.strokeStyle = colors[route]; ctx.globalAlpha = .27; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, rect.w * .4, rect.h * .095, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = colors[route];
    ctx.fillText(route.toUpperCase(), rect.x + 14, cy - rect.h * .11);
    for (const node of nodes.filter(n => n.event.route === route)) {
      ctx.globalAlpha = node.match ? .27 : .035;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(node.x, node.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(node.x, node.y - 9 - (node.depth + 1) * 8); ctx.stroke();
    }
  });
  let labels = 0;
  for (const node of nodes) {
    const active = node.id === selected;
    ctx.globalAlpha = node.match ? .7 + (node.depth + 1) * .15 : .08;
    ctx.fillStyle = colors[node.event.route];
    ctx.beginPath(); ctx.arc(node.x, node.y, active ? 6 : 2.5 + (node.depth + 1) * 1.2, 0, Math.PI * 2); ctx.fill();
    if (active) {
      ctx.strokeStyle = theme.text; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(node.x, node.y, 10, 0, Math.PI * 2); ctx.stroke();
    }
    if (node.match && (active || labels++ < (query ? 12 : 8))) {
      const label = String(node.event.word ?? node.event.displayLabel ?? node.event.label);
      const text = label.length > 20 ? label.slice(0, 19) + '…' : label;
      const width = ctx.measureText(text).width;
      const x = Math.max(rect.x + 8, Math.min(node.x + 10, rect.x + rect.w - width - 8));
      ctx.globalAlpha = 1; ctx.fillStyle = theme.background; ctx.fillRect(x - 2, node.y - 19, width + 4, 15);
      ctx.fillStyle = active ? theme.text : colors[node.event.route]; ctx.fillText(text, x, node.y - 8);
    }
  }
  ctx.globalAlpha = 1; ctx.fillStyle = theme.muted;
  ctx.fillText(events.length ? `${nodes.filter(n=>n.match).length} / ${nodes.length} NODES` : 'WAITING FOR EVENTS', rect.x + 14, rect.y + rect.h - 16);
  ctx.restore();
  return nodes.filter(n => n.match);
}
