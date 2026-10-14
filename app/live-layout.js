const box = (x, y, w, h) => Object.freeze({ x, y, w, h });
export const PAGE_SIZE = 32;
export const LIVE_LAYOUTS = Object.freeze({
  portrait: Object.freeze({ width:1080, height:1350, scene:box(40,130,1000,850), stream:box(40,1000,630,300), stats:box(690,1000,350,300) }),
  landscape: Object.freeze({ width:1600, height:900, scene:box(40,125,1080,730), stream:box(1140,125,420,410), stats:box(1140,555,420,300) }),
  square: Object.freeze({ width:1080, height:1080, scene:box(40,130,1000,730), stream:null, stats:box(40,880,1000,150) }),
});

export function eventPlacement(layout, events) {
  const s=layout.scene, spacing=Math.min(22,(s.h-110)/PAGE_SIZE);
  return events.slice(0,PAGE_SIZE).map((event,index)=>({event,x:s.x+35,y:s.y+79+index*spacing,w:s.w*.30,h:spacing-2,index}));
}
export function hitEvent(regions,x,y) {
  return regions.find(region=>x>=region.x && x<=region.x+region.w && y>=region.y-region.h/2 && y<=region.y+region.h/2)?.event.id ?? null;
}
export function routeTarget(layout,route) {
  const s=layout.scene,index=['code','model','you'].indexOf(route);
  return {x:s.x+s.w*.875,y:s.y+s.h*(.23+Math.max(0,index)*.27)};
}

// Closed analytic orbit: position AND velocity join smoothly, at any elapsed time.
export function livePose(layout,time,reducedMotion=false) {
  const s=layout.scene,angle=reducedMotion?1.3:time*Math.PI*2/16;
  const rx=s.w*.075,ry=s.h*.33,cx=s.x+s.w*.39,cy=s.y+s.h*.50,omega=reducedMotion?0:Math.PI*2/16;
  return {x:cx+Math.cos(angle)*rx,y:cy+Math.sin(angle)*ry,vx:-Math.sin(angle)*rx*omega,vy:Math.cos(angle)*ry*omega};
}
export function resolveCursor(meta,sinceAnchorMs=0) {
  const playback=meta.playback,delta=Math.max(0,sinceAnchorMs)/1000;
  if (playback.mode==='live') return playback.position+delta;
  if (playback.mode==='paused') return playback.position;
  const position=playback.position+delta*playback.speed;
  const live=meta.status==='live'&&meta.source!=='replay';
  const maximum=live?meta.elapsed+delta:meta.duration;
  return playback.loop && !live && maximum>0 ? position%maximum : Math.min(maximum,position);
}
export function parseSseFrames(input) {
  const normalized=input.replace(/\r\n/g,'\n'),parts=normalized.split('\n\n'),rest=parts.pop(),messages=[];
  for(const frame of parts) {
    const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(data) messages.push(JSON.parse(data));
  }
  return {messages,rest};
}
export function alpha(hex,value) {
  return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${value})`;
}
