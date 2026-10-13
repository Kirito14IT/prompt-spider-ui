import { SPIDER_TRACK, SCROLL_TRACK } from './reference-track.js';
// Measured at exact timestamps in the supplied MP4. Counts are observations;
// per-word identities and interpolation between observations are reconstructed.
export const REFERENCE_COUNTS = [
  [0,1,0,0,0,0],[1,17,0,0,0,0],[2,37,0,0,0,0],
  [3,56,15,11,2,2],[4,67,35,26,4,5],[5,77,56,41,10,5],
  [6,86,63,48,10,5],[7,90,76,61,10,5],[8,91,83,65,12,6],
  [9,91,89,69,14,6],[10,91,91,71,14,6],
  [10.65,91,91,71,14,6],[10.666667,93,91,71,14,6],[10.9,93,91,71,14,6],
  [11,95,91,71,14,6],
  [12,114,91,71,14,6],[13,131,93,72,15,6],[14,151,109,85,18,6],
  [15,162,127,99,19,9],[16,168,145,113,22,10],[17,172,161,127,24,10],
  [18,175,166,131,24,11],[19,175,172,135,26,11],[20,175,175,137,27,11],
  [20.921,175,175,137,27,11],
];

// Screen-space center and camera row offset. Refined from the colored core in
// neighboring source frames; independent from the latest decision token.
export const REFERENCE_POSES = SPIDER_TRACK;

export function interpolateColumn(points, time, column) {
  if (time <= points[0][0]) return points[0][column];
  for (let i = 1; i < points.length; i++) {
    if (time <= points[i][0]) {
      const a = points[i - 1], b = points[i], t = (time - a[0]) / (b[0] - a[0]);
      return a[column] + (b[column] - a[column]) * t;
    }
  }
  return points.at(-1)[column];
}
export function timeAtCount(count, column) {
  if (count <= REFERENCE_COUNTS[0][column]) return 0;
  for (let i = 1; i < REFERENCE_COUNTS.length; i++) {
    const a = REFERENCE_COUNTS[i - 1], b = REFERENCE_COUNTS[i];
    if (count <= b[column] && b[column] > a[column]) return a[0] + (b[0] - a[0]) * (count - a[column]) / (b[column] - a[column]);
  }
  return REFERENCE_COUNTS.at(-1)[0];
}
export function readAt(time) { return Math.floor(interpolateColumn(REFERENCE_COUNTS, time, 1) + 1e-7); }

function positionAt(time) {
  const points = REFERENCE_POSES;
  let i = points.findIndex((p, j) => j > 0 && p[0] >= time) - 1;
  if (i < 0) i = time <= 0 ? 0 : points.length - 2;
  const a = points[i], b = points[i + 1];
  const t = Math.max(0, Math.min(1, (time - a[0]) / (b[0] - a[0])));
  const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 2)];
  const coord = k => {
    const m0 = (b[k] - prev[k]) / (b[0] - prev[0]) * (b[0] - a[0]);
    const m1 = (next[k] - a[k]) / (next[0] - a[0]) * (b[0] - a[0]);
    return (2*t*t*t-3*t*t+1)*a[k] + (t*t*t-2*t*t+t)*m0 + (-2*t*t*t+3*t*t)*b[k] + (t*t*t-t*t)*m1;
  };
  return { x: coord(1), y: coord(2), scroll: interpolateColumn(SCROLL_TRACK, time, 1) / 19.1 };
}
export function referencePose(time) {
  const p = positionAt(time), before = positionAt(Math.max(0, time - .015)), after = positionAt(Math.min(20.921, time + .015));
  return { ...p, vx: (after.x - before.x) / .03, vy: (after.y - before.y) / .03 };
}
export function arcX(y) { return 710 + .00072 * (y - 450) ** 2; }
const slotPermutations = new Map();
export function routeSlot(index, total) {
  if (!slotPermutations.has(total)) {
    const slots=Array.from({length:total},(_,i)=>i);
    let seed=0x53a9b21;
    for(let j=total-1;j>0;j--) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const k=seed%(j+1);[slots[j],slots[k]]=[slots[k],slots[j]];
    }
    slotPermutations.set(total,slots);
  }
  return slotPermutations.get(total)[index%total];
}
export function cubicPoint(t, a, b, c, d) {
  const m = 1 - t;
  return { x:m*m*m*a.x+3*m*m*t*b.x+3*m*t*t*c.x+t*t*t*d.x, y:m*m*m*a.y+3*m*m*t*b.y+3*m*t*t*c.y+t*t*t*d.y };
}

// Visual transmission lasts about a second; aggregate fork counters have a
// separate observed delay and must not be used as the visual arrival clock.
export function flightGeometry(decision, elapsed, origin, total = 195) {
  const duration = decision.flightDuration || 1.08;
  const age = (elapsed - decision.launchTime) / duration;
  const progress = Math.max(0, Math.min(1, age));
  const eased = 1 - (1 - progress) ** 3;
  const targetY = 70 + (decision.slot + .5) / total * 778;
  const end = { x: arcX(targetY) + 52, y: targetY };
  const dx = end.x - origin.x;
  const bend = Math.sin(decision.ordinal * 2.399) * 18;
  const controlA = {x:origin.x + dx / 3,y:origin.y + (targetY-origin.y)*.2 + bend};
  const controlB = {x:origin.x + dx * 2 / 3,y:targetY - (targetY-origin.y)*.2 + bend};
  return {origin,controlA,controlB,end,point:cubicPoint(eased,origin,controlA,controlB,end),progress};
}
