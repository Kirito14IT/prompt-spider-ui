const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = value => value * value * (3 - 2 * value);
const mix = (a, b, fraction) => a + (b - a) * fraction;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

// Reconstructed from inspection of the source's 50 ms frame sequence. The endpoint pauses on the
// word before the whole dotted arm folds back; it does not orbit indefinitely.
export const PROBE_TIMING = Object.freeze({ reach: 0.26, hold: 0.26, retract: 0.26 });

function seedFor(event) {
  let seed = (finite(event.index) + 1) * 2654435761 >>> 0;
  for (const character of String(event.word ?? '')) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  return seed;
}

/** Absolute, seekable arm geometry; target remains attached to its word. */
export function probePose(event, time, body, reducedMotion = false) {
  const seed = seedFor(event);
  const x = finite(body?.x), y = finite(body?.y);
  const target = { x: finite(event.target?.x, x), y: finite(event.target?.y, y) };
  const dx = target.x - x, dy = target.y - y;
  const distance = Math.hypot(dx, dy);
  const ux = distance > 0.001 ? dx / distance : Math.cos(seed % 628 / 100);
  const uy = distance > 0.001 ? dy / distance : Math.sin(seed % 628 / 100);
  const side = seed & 1 ? 1 : -1;
  const launchTime = finite(event.launchTime);
  const start = launchTime - PROBE_TIMING.reach;
  const holdEnd = launchTime + PROBE_TIMING.hold;
  const end = holdEnd + PROBE_TIMING.retract;
  const visible = Number.isFinite(time) && time >= start && time < end;
  let phase = 'idle', phaseProgress = 0, extension = 0, contact = false;
  if (visible && time < launchTime) {
    phase = 'reach';
    phaseProgress = clamp((time - start) / PROBE_TIMING.reach);
    // A short sideways preparation leads into the quick outward sweep. Endpoint
    // speed settles to zero before contact, keeping the word pinned during hold.
    extension = smooth(phaseProgress ** 1.35);
  } else if (visible && time < holdEnd) {
    phase = 'hold';
    phaseProgress = clamp((time - launchTime) / PROBE_TIMING.hold);
    extension = 1;
    contact = true;
  } else if (visible) {
    phase = 'retract';
    phaseProgress = clamp((time - holdEnd) / PROBE_TIMING.retract);
    extension = 1 - smooth(phaseProgress ** 0.9);
  }
  if (visible && reducedMotion) { phase = 'hold'; phaseProgress = 0.5; extension = 1; contact = true; }

  const radius = 1 / Math.sqrt(ux * ux / (23 * 23) + uy * uy / (29 * 29));
  const root = { x: x + ux * radius, y: y + uy * radius };
  const restRadius = Math.min(54 + seed % 10, Math.max(radius + 7, distance - 12));
  const restingTip = { x: x + ux * restRadius, y: y + uy * restRadius };
  const motionPulse = reducedMotion || phase === 'idle' || phase === 'hold'
    ? 0 : Math.sin(Math.PI * phaseProgress) ** 2;
  const sweepSize = clamp((distance - radius) * 0.27, 18, 35);
  // Moving only the elbow leaves a straight-going tip. Give the tip its own
  // lateral arc, with an opposite, slightly hooked path during withdrawal.
  const lateral = side * sweepSize * motionPulse * (phase === 'retract'
    ? -0.93 * (1 + 0.15 * Math.sin(2 * Math.PI * phaseProgress)) : 1);
  const hook = phase === 'retract' ? 5.5 * motionPulse * Math.sin(2 * Math.PI * phaseProgress) : 0;
  const tip = {
    x: mix(restingTip.x, target.x, extension) - uy * lateral + ux * hook,
    y: mix(restingTip.y, target.y, extension) + ux * lateral + uy * hook,
  };
  const reach = Math.hypot(tip.x - root.x, tip.y - root.y);
  // The joints fold more deeply and change their bend direction on withdrawal.
  const fold = (20 + seed % 9) * (1 - extension * 0.65);
  const tremor = reducedMotion ? 0 : Math.sin(time * 5.1 + seed % 97) * 1.3 * extension;
  const bend = side * (fold + tremor + (phase === 'retract' ? -39 : 24) * motionPulse);
  const joints = [
    { x: mix(root.x, tip.x, 0.34) - uy * bend, y: mix(root.y, tip.y, 0.34) + ux * bend },
    { x: mix(root.x, tip.x, 0.72) + uy * bend * 0.36, y: mix(root.y, tip.y, 0.72) - ux * bend * 0.36 },
  ];
  const fade = phase === 'reach' ? clamp(phaseProgress / 0.26) : phase === 'retract' ? clamp((1 - phaseProgress) / 0.25) : 1;
  return {
    event, phase, phaseProgress, extension, visible, contact, start, end,
    root, joints, tip, target, restingTip, distance, reach, lateral,
    fingerOpening: reducedMotion ? 0 : phase === 'hold'
      ? 1.1 * Math.sin(Math.PI * phaseProgress) ** 2
      : motionPulse * (phase === 'reach' ? 3 : 1.8),
    opacity: visible ? (reducedMotion ? 0.92 : fade) : 0,
    width: Math.max(8, finite(event.width, String(event.word ?? '').length * 7.5)),
  };
}

function cubic(pose, fraction) {
  const back = 1 - fraction;
  const [a, b] = pose.joints;
  return {
    x: back ** 3 * pose.root.x + 3 * back * back * fraction * a.x + 3 * back * fraction * fraction * b.x + fraction ** 3 * pose.tip.x,
    y: back ** 3 * pose.root.y + 3 * back * back * fraction * a.y + 3 * back * fraction * fraction * b.y + fraction ** 3 * pose.tip.y,
  };
}

function sampleChain(pose) {
  const points = [{ point: pose.root, length: 0 }];
  let length = 0;
  for (let index = 1; index <= 40; index++) {
    const point = cubic(pose, index / 40), previous = points.at(-1).point;
    length += Math.hypot(point.x - previous.x, point.y - previous.y);
    points.push({ point, length });
  }
  return { points, length };
}

function chainPoint(chain, length) {
  let index = 1;
  while (index < chain.points.length - 1 && chain.points[index].length < length) index++;
  const a = chain.points[index - 1], b = chain.points[index];
  const fraction = (length - a.length) / Math.max(0.001, b.length - a.length);
  return { x: mix(a.point.x, b.point.x, fraction), y: mix(a.point.y, b.point.y, fraction) };
}

function drawArm(ctx, pose) {
  const [a, b] = pose.joints;
  ctx.globalAlpha = pose.opacity;
  ctx.beginPath(); ctx.moveTo(pose.root.x, pose.root.y);
  ctx.bezierCurveTo(a.x, a.y, b.x, b.y, pose.tip.x, pose.tip.y);
  ctx.lineWidth = 0.65;
  ctx.strokeStyle = 'rgba(189,221,213,0.43)'; ctx.stroke();
  const chain = sampleChain(pose);
  const spacing = 5.6;
  ctx.fillStyle = 'rgba(238,255,247,0.92)';
  for (let along = 3; along < chain.length - 1; along += spacing) {
    const point = chainPoint(chain, along);
    const size = along > chain.length - 14 ? 1.9 : 1.65;
    ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
  }
  for (const fraction of [0.34, 0.72]) {
    const joint = cubic(pose, fraction);
    ctx.fillStyle = 'rgba(236,255,246,0.66)';
    ctx.fillRect(joint.x - 0.85, joint.y - 0.85, 1.7, 1.7);
  }
  ctx.fillStyle = '#effff5';
  ctx.fillRect(pose.tip.x - 1.05, pose.tip.y - 1.05, 2.1, 2.1);

  // A small pair of fingers opens on approach and closes around the word.
  const closing = pose.extension ** 5;
  const halfWidth = mix(4.2, pose.width / 2 + 2, closing) + pose.fingerOpening;
  const halfHeight = mix(7.6, 7, closing) + pose.fingerOpening * 0.35;
  const finger = mix(2.6, 4.2, closing);
  ctx.strokeStyle = `rgba(231,255,243,${0.53 + closing * 0.4})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const edge = pose.tip.x + side * halfWidth;
    ctx.moveTo(edge - side * finger, pose.tip.y - halfHeight);
    ctx.lineTo(edge, pose.tip.y - halfHeight);
    ctx.lineTo(edge, pose.tip.y + halfHeight);
    ctx.lineTo(edge - side * finger, pose.tip.y + halfHeight);
  }
  ctx.stroke();
}

function questionColor(question) {
  if (/approv|permit|confirm/i.test(question)) return '#eed560';
  if (/source|claim|specific|ambig/i.test(question)) return '#e7a18c';
  return '#73dba5';
}

function drawContact(ctx, pose) {
  if (!pose.contact) return;
  const { event, target, width } = pose;
  const color = questionColor(String(event.question ?? ''));
  ctx.globalAlpha = pose.opacity;
  ctx.fillStyle = 'rgba(193,248,223,0.12)';
  ctx.fillRect(target.x - width / 2 - 2, target.y - 7, width + 4, 14);
  ctx.strokeStyle = 'rgba(224,255,241,0.78)'; ctx.lineWidth = 0.55;
  ctx.strokeRect(target.x - width / 2 - 2, target.y - 7, width + 4, 14);

  const score = clamp(finite(event.score, 0.95)).toFixed(2);
  const label = `${event.question || 'relevant to task?'} p ${score}`;
  ctx.font = '10px "Cascadia Code", Consolas, monospace';
  const labelWidth = ctx.measureText(label).width + 7;
  const labelX = clamp(target.x - width / 2, 66, 356 - labelWidth);
  // The label is only 5 px from the contacted word and follows its coordinate.
  const labelY = target.y - 23;
  ctx.fillStyle = color; ctx.fillRect(labelX, labelY, labelWidth, 12);
  ctx.fillStyle = '#10241c'; ctx.textBaseline = 'middle';
  ctx.fillText(label, labelX + 3.5, labelY + 6.4);
}

/** Draw at most twelve live grasp cycles, without angle binning or history. */
export function drawProbes(ctx, opts = {}) {
  const time = finite(opts.time);
  const body = opts.body ?? { x: 0, y: 0 };
  const reducedMotion = Boolean(opts.reducedMotion);
  const maximum = clamp(Math.round(finite(opts.maxVisible, 12)), 1, 12);
  const poses = (opts.events ?? []).map(event => probePose(event, time, body, reducedMotion))
    .filter(pose => pose.visible && pose.distance > 30)
    .sort((a, b) => b.event.launchTime - a.event.launchTime || a.event.index - b.event.index)
    .slice(0, maximum).reverse();
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const pose of poses) drawArm(ctx, pose);
  for (const pose of poses) drawContact(ctx, pose);
  ctx.restore();
  return poses;
}
