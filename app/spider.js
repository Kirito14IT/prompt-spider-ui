const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const fraction = value => value - Math.floor(value);
const smooth = value => value * value * (3 - 2 * value);

function path(ctx, points, color, width = 0.75) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

// A planted foot moves backwards relative to the body; its return stroke lifts.
// Unlike rotating a whole limb, this keeps each knee solving a distinct pose.
function strideAt(cycle, stride) {
  const phase = fraction(cycle);
  if (phase < 0.64) return { along: (0.5 - phase / 0.64) * stride, lift: 0 };
  const swing = (phase - 0.64) / 0.36;
  return { along: (smooth(swing) - 0.5) * stride, lift: Math.sin(swing * Math.PI) };
}

export function heartbeatAt(time, reducedMotion = false) {
  if(reducedMotion)return {phase:0,beat:.15,size:10,glow:5,intensity:.8,roundness:1.5,rotation:0};
  const phase=fraction(finite(time)/.86);
  const beat=Math.min(1,Math.exp(-(((phase-.16)/.055)**2))+.62*Math.exp(-(((phase-.38)/.07)**2)));
  return {phase,beat,size:8.5+6*beat,glow:4+10*beat,intensity:.66+.34*beat,roundness:1.1+1.8*beat,rotation:Math.sin(time*2.7)*.1+beat*.12};
}

export function legPose({time=0,phase=0,speed=0,localVelocity={x:0,y:1},reducedMotion=false,side=-1,index=0}={}) {
  const stride=reducedMotion?0:13+Math.min(speed*.11,13);
  const frequency=1.8+Math.min(speed/200,.65);
  const row=(index-3.5)/3.8,spread=Math.sin((index+.75)/8.5*Math.PI);
  const cycle=reducedMotion?0:time*frequency+phase+(index%2)*.5+(side>0?.5:0)+index*.035;
  const step=strideAt(cycle,stride);
  const curl=reducedMotion?0:Math.sin(cycle*TAU)*2.8;
  const root={x:side*(22.2*Math.sqrt(1-row*row)),y:row*27};
  const foot={x:side*(39+spread*17)+localVelocity.x*step.along-side*step.lift*7.5+side*curl,
    y:row*52+localVelocity.y*step.along-step.lift*10+curl*.65};
  const knee={x:side*(30+spread*9)-side*step.lift*4,y:row*34+(index<4?-5.5:5.5)-step.lift*5+curl*.4};
  const ankle={x:foot.x-side*3.8,y:foot.y+(index<4?1.2:-1.2)};
  return {root,knee,ankle,foot,lift:step.lift};
}

function drawLegs(ctx, time, gaitPhase, speed, localVelocity, reducedMotion) {
  const poses=[];
  for (let side = -1; side <= 1; side += 2) {
    for (let index = 0; index < 8; index++) {
      const pose=legPose({time,phase:gaitPhase,speed,localVelocity,reducedMotion,side,index});
      const {root,knee,ankle,foot,lift}=pose;poses.push({side,index,...pose});
      const spread=Math.sin((index+.75)/8.5*Math.PI);
      // Broad, faint under-stroke and a very fine luminous center.
      path(ctx, [root, knee, ankle, foot], 'rgba(89,188,170,0.14)', 2.3);
      path(ctx, [root, knee, ankle, foot], `rgba(171,235,220,${0.6 + spread * 0.19})`, 1.05);
      ctx.fillStyle = lift > 0.35 ? 'rgba(190,241,225,0.72)' : 'rgba(232,255,246,0.96)';
      ctx.fillRect(foot.x - 1.2, foot.y - 1.2, 2.4, 2.4);
      ctx.fillStyle = 'rgba(127,206,188,0.43)';
      ctx.fillRect(knee.x - 0.55, knee.y - 0.55, 1.1, 1.1);
    }
  }
  return poses;
}

function drawFeelers(ctx, time, reducedMotion, activeCount = 0) {
  // Long arms are now event-driven in probes.js. Only the resting short
  // appendages remain here; there are no permanent links to old words.
  const localCount = Math.max(4,22-activeCount);
  for (let index = 0; index < localCount; index++) {
    const angle = index / localCount * TAU + 0.065;
    const outward = 43 + 15 * (0.5 + 0.5 * Math.sin(time * 2.7 + index * 4.73));
    const sway = reducedMotion ? 0 : Math.sin(time * 2.8 + index * 2.17) * 5.8;
    const root = { x: Math.cos(angle) * 21, y: Math.sin(angle) * 27 };
    const tip = { x: Math.cos(angle) * outward + sway, y: Math.sin(angle) * outward * 1.06 };
    const bend = { x: root.x * 0.4 + tip.x * 0.6 - Math.sin(angle) * 3, y: root.y * 0.4 + tip.y * 0.6 + Math.cos(angle) * 3 };
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    ctx.quadraticCurveTo(bend.x, bend.y, tip.x, tip.y);
    ctx.strokeStyle = 'rgba(117,184,172,0.24)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    // Spaced lights make the finer appendages look different from the legs.
    for (let dot = 0.55; dot <= 1; dot += 0.15) {
      const one = 1 - dot;
      const px = one * one * root.x + 2 * one * dot * bend.x + dot * dot * tip.x;
      const py = one * one * root.y + 2 * one * dot * bend.y + dot * dot * tip.y;
      const pulse = reducedMotion ? 0.6 : 0.6 + 0.18 * Math.sin(time * 4 - dot * 9 + index);
      ctx.fillStyle = `rgba(195,233,217,${pulse * 0.55})`;
      ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
    }
  }
}

function wirePoint(latitude, longitude, time) {
  const ring = Math.cos(latitude);
  const x = 23.5 * ring * Math.cos(longitude);
  const y = 29.5 * Math.sin(latitude);
  const z = 13 * ring * Math.sin(longitude);
  const tilt = 0.38 + Math.sin(time * 0.32) * 0.07;
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const py = y * c - z * s;
  const pz = y * s + z * c;
  // A small yaw makes meridians visibly curved rather than radial spokes.
  return { x: x * 0.94 + pz * 0.3, y: py, z: pz * 0.94 - x * 0.3 };
}

function drawWireBody(ctx, time, score, heartbeat) {
  const fill = ctx.createRadialGradient(-7, -9, 1, 0, 0, 33);
  fill.addColorStop(0, 'rgba(22,70,67,0.89)');
  fill.addColorStop(0.72, 'rgba(10,46,45,0.88)');
  fill.addColorStop(1, 'rgba(7,29,29,0.86)');
  ctx.beginPath(); ctx.ellipse(0, 0, 23.7, 30, 0, 0, TAU);
  ctx.fillStyle = fill; ctx.fill();

  ctx.save();
  ctx.clip();
  const curves = [];
  for (let ring = -5; ring <= 5; ring++) {
    const points = [];
    for (let point = 0; point <= 64; point++) points.push(wirePoint(ring / 6 * Math.PI / 2, point / 64 * TAU, time));
    curves.push(points);
  }
  for (let meridian = 0; meridian < 13; meridian++) {
    const points = [];
    for (let point = 0; point <= 56; point++) points.push(wirePoint(-Math.PI / 2 + point / 56 * Math.PI, meridian / 13 * TAU + time * 0.045, time));
    curves.push(points);
  }
  for (let front = 0; front < 2; front++) {
    ctx.lineWidth = front ? 0.55 : 0.45;
    ctx.strokeStyle = front ? 'rgba(103,204,188,0.43)' : 'rgba(88,165,156,0.18)';
    ctx.beginPath();
    for (const points of curves) {
      for (let index = 1; index < points.length; index++) {
        const previous = points[index - 1], current = points[index];
        if ((previous.z + current.z >= 0) !== Boolean(front)) continue;
        ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath(); ctx.ellipse(0, 0, 23.7, 30, 0, 0, TAU);
  ctx.strokeStyle = 'rgba(110,234,211,0.85)'; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0.8, 0.5, 25, 30.9, 0.015, 0, TAU);
  ctx.strokeStyle = 'rgba(80,185,168,0.26)'; ctx.lineWidth = 0.5; ctx.stroke();

  ctx.save();
  const {beat,size,glow,intensity,roundness,rotation}=heartbeat;
  ctx.rotate(rotation);ctx.shadowColor='#ff3b80';ctx.shadowBlur=glow;
  ctx.fillStyle=`rgba(${Math.round(224+31*beat)},${Math.round(42+68*beat)},${Math.round(112+53*beat)},${intensity})`;
  ctx.beginPath();ctx.roundRect(-size/2,-size/2,size,size,roundness);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle=`rgba(255,168,194,${.18+.45*beat})`;
  ctx.fillRect(-size*.28,-size*.3,size*.55,size*.52);
  ctx.strokeStyle=`rgba(255,84,144,${.08+.25*beat})`;ctx.lineWidth=.65;
  ctx.beginPath();ctx.ellipse(0,0,size*.8,size*.7,0,0,TAU);ctx.stroke();
  ctx.restore();
}

function drawHead(ctx, time, reducedMotion) {
  ctx.beginPath(); ctx.ellipse(0, -33, 6.2, 7.3, 0, 0, TAU);
  ctx.fillStyle = 'rgba(9,41,39,0.88)'; ctx.fill();
  ctx.strokeStyle = 'rgba(132,229,211,0.83)'; ctx.lineWidth = 0.9; ctx.stroke();
  path(ctx, [{ x: -4.5, y: -34.5 }, { x: 0, y: -29 }, { x: 4.5, y: -34.5 }], 'rgba(91,178,158,0.48)', 0.55);
  ctx.fillStyle = 'rgba(205,255,238,0.92)';
  ctx.fillRect(-3.7, -37.2, 1.6, 1.8); ctx.fillRect(2.1, -37.2, 1.6, 1.8);
  for (const side of [-1, 1]) {
    const sway = reducedMotion ? 0 : Math.sin(time * 2 + side) * 2;
    ctx.beginPath(); ctx.moveTo(side * 3.5, -38);
    ctx.quadraticCurveTo(side * 6.5, -48, side * (15 + sway), -56);
    ctx.strokeStyle = 'rgba(191,236,222,0.69)'; ctx.lineWidth = 0.85; ctx.stroke();
  }
}

/**
 * Draw a reference-scale wire spider without storing state between frames.
 * Coordinates use the 1080 × 1350 stage; time is seconds, velocity is px/s.
 * Targets are absolute stage coordinates. phase offsets the walking cycle.
 * All context changes are isolated, so paused frames and seeks are repeatable.
 */
export function drawSpider(ctx, opts = {}) {
  const x = finite(opts.x), y = finite(opts.y);
  const reducedMotion = Boolean(opts.reducedMotion);
  const time = reducedMotion ? 0 : finite(opts.time);
  const vx = finite(opts.vx), vy = finite(opts.vy);
  const speed = Math.hypot(vx, vy);
  const phase = finite(opts.phase);
  const score = clamp(finite(opts.score, 0.95), 0, 1);
  const heartbeat=heartbeatAt(time,reducedMotion);
  // Follow the movement vector, including turns through horizontal. Blending
  // unit vectors avoids angle wrapping and unstable orientation at a standstill.
  const restingHeading = 1.22 + (reducedMotion ? 0 : Math.sin(time * 0.47 + 0.8) * 0.08);
  const directionalWeight = reducedMotion ? 0 : speed * speed / (speed * speed + 32 * 32);
  const normalizer = Math.max(speed, 1);
  const heading = Math.atan2(
    vx / normalizer * directionalWeight + Math.sin(restingHeading) * (1 - directionalWeight),
    -vy / normalizer * directionalWeight + Math.cos(restingHeading) * (1 - directionalWeight),
  );
  const cos = Math.cos(heading), sin = Math.sin(heading);
  const stretchX = 1 - Math.min(speed / 2200, 0.055);
  const stretchY = 1 + Math.min(speed / 2800, 0.035);
  const breathing = reducedMotion ? 0 : Math.sin(time * 2.4) * 0.45;
  const localVelocity = speed > 2
    ? { x: (vx * cos + vy * sin) / normalizer, y: (-vx * sin + vy * cos) / normalizer }
    : { x: 0.12, y: 0.99 };
  ctx.save();
  try {
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0; ctx.setLineDash([]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.translate(x, y + breathing); ctx.rotate(heading); ctx.scale(stretchX, stretchY);
    drawFeelers(ctx,time,reducedMotion,finite(opts.activeProbes));
    const legs=drawLegs(ctx, time, phase, speed, localVelocity, reducedMotion);
    drawWireBody(ctx, time, score, heartbeat);
    drawHead(ctx, time, reducedMotion);
    return {x,y,heading,heartbeat,legs};
  } finally {
    ctx.restore();
  }
}
