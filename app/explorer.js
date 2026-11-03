/** Shared controls for reference, custom, Agent and replay canvases. */
export function mountExplorer({renderer, refresh, getEvents, select, toast}) {
  const heading = document.querySelector('.view-heading');
  const toolbar = document.createElement('div');
  toolbar.className = 'explorer';
  toolbar.innerHTML = `<div class="explorer-views" role="group" aria-label="网络视图"><button id="classicView" aria-pressed="true">经典蛛网</button><button id="orbitView" aria-pressed="false">星轨网络</button><button id="nebulaView" aria-pressed="false">星云网络</button></div><label class="explorer-search"><span class="sr-only">搜索已出现的词条或事件</span><input id="nodeSearch" type="search" maxlength="200" placeholder="搜索词条 / 事件" autocomplete="off"></label><button id="snapshotBtn">保存 PNG</button><div class="network-tools" hidden><label>旋转 <input id="orbitRotation" aria-label="网络旋转角度" type="range" min="-180" max="180" value="0"></label><label id="tiltControl" hidden>倾角 <input id="networkTilt" aria-label="星云倾角" type="range" min="-0.8" max="0.8" step="0.05" value="0"></label><label>缩放 <input id="networkZoom" aria-label="网络缩放" type="range" min="1" max="1.7" step="0.05" value="1"><output id="networkZoomValue">1.00×</output></label><label class="network-flow"><input id="energyFlow" type="checkbox" checked>能量流</label><button id="resetCameraBtn">复位镜头</button><span id="networkHint">拖动旋转 · 悬停聚焦 · 画布内 + / − 缩放，0 复位</span></div><div id="nodeResults" class="node-results" aria-label="搜索结果" hidden></div>`;
  heading.after(toolbar);
  const $ = selector => toolbar.querySelector(selector);
  const canvas = renderer.canvas, host = document.querySelector('#stageHost');
  const originalLabel = canvas.getAttribute('aria-label');
  const tooltip = document.createElement('div');
  tooltip.id = 'networkTooltip'; tooltip.className = 'network-tooltip'; tooltip.hidden = true; tooltip.setAttribute('role','tooltip'); host.append(tooltip);
  const search = $('#nodeSearch'), results = $('#nodeResults');
  const network = () => ['orbit','nebula'].includes(renderer.networkView);
  let drag = null, suppressClick = false, signature = '', tooltipSignature = '';
  function tooltipContent(item) {
    const next=JSON.stringify([item.word??item.displayLabel??item.label,item.route,item.status,item.score]);
    if(next===tooltipSignature)return;
    tooltipSignature=next;
    const name=document.createElement('strong');name.textContent=String(item.word??item.displayLabel??item.label);
    const detail=document.createElement('span');detail.textContent=`${item.route}${item.status?' · '+item.status:''} · ${typeof item.score==='number'?'分数 '+item.score.toFixed(3):'分数未提供'}`;
    tooltip.replaceChildren(name,detail);
  }
  function syncCamera() {
    const angle = renderer.orbitAngle || 0;
    $('#orbitRotation').value = String(Math.atan2(Math.sin(angle),Math.cos(angle))*180/Math.PI);
    $('#networkTilt').value = String(renderer.orbitTilt || 0);
    $('#networkZoom').value = String(renderer.networkZoom || 1);
    $('#networkZoomValue').textContent = `${(renderer.networkZoom || 1).toFixed(2)}×`;
  }
  function resetCamera() { renderer.orbitAngle=0; renderer.orbitTilt=0; renderer.networkZoom=1; syncCamera(); refresh(); }
  function clearHover({redraw=true}={}) {
    const changed=renderer.hoveredId!=null; renderer.hoveredId=null; tooltip.hidden=true;
    if(changed&&redraw)refresh();
  }
  function release(event) {
    if(!drag || (event && drag.id!==event.pointerId))return;
    const id=drag.id; drag=null;
    if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  }
  function searchEvents() {
    const query=search.value.trim(); renderer.searchQuery=query;
    results.replaceChildren(); results.hidden=!query;
    if(!query)return;
    const items=getEvents().filter(e=>String(e.word??e.displayLabel??e.label).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    const note=document.createElement('span'); note.textContent=`${items.length} 个匹配 · 当前时间点 / 当前页`; results.append(note);
    for(const event of items.slice(0,12)) {
      const button=document.createElement('button'); button.textContent=`${event.word??event.displayLabel??event.label} → ${event.route}`;
      button.addEventListener('click',()=>select(event.id??event.index)); results.append(button);
    }
  }
  search.addEventListener('input',()=>{clearHover({redraw:false});searchEvents();refresh();});
  for(const [id,mode] of [['classicView','classic'],['orbitView','orbit'],['nebulaView','nebula']]) {
    $('#'+id).addEventListener('click',()=>{
      release();clearHover({redraw:false});renderer.networkView=mode;canvas.dataset.networkView=mode;
      $('.network-tools').hidden=mode==='classic'; $('#tiltControl').hidden=mode!=='nebula';
      for(const button of toolbar.querySelectorAll('.explorer-views button'))button.setAttribute('aria-pressed',String(button.id===id));
      canvas.setAttribute('aria-label',mode==='classic'?originalLabel:`${mode==='nebula'?'星云':'星轨'}网络：拖动旋转，悬停聚焦，点击查看详情；加减键缩放，0 复位。`);
      refresh();
    });
  }
  $('#orbitRotation').addEventListener('input',event=>{renderer.orbitAngle=Number(event.target.value)/180*Math.PI;clearHover({redraw:false});refresh();});
  $('#networkTilt').addEventListener('input',event=>{renderer.orbitTilt=Number(event.target.value);clearHover({redraw:false});refresh();});
  $('#networkZoom').addEventListener('input',event=>{renderer.networkZoom=Number(event.target.value);clearHover({redraw:false});syncCamera();refresh();});
  $('#energyFlow').addEventListener('change',event=>{renderer.energyFlow=event.target.checked;refresh();});
  $('#resetCameraBtn').addEventListener('click',resetCamera);
  $('#snapshotBtn').addEventListener('click',()=>{
    refresh();canvas.toBlob(blob=>{
      if(!blob){toast('保存失败，请重试');return;}
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`prompt-spider-${renderer.networkView||'classic'}.png`;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已保存当前画面 PNG');
    },'image/png');
  });
  canvas.addEventListener('pointerdown',event=>{
    if(!network()||event.button!==0||event.isPrimary===false||drag)return;
    suppressClick=false; clearHover({redraw:false});
    drag={x:event.clientX,y:event.clientY,angle:renderer.orbitAngle||0,pitch:renderer.orbitTilt||0,id:event.pointerId,moved:false};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if(drag) {
      if(drag.id!==event.pointerId)return;
      if(event.pointerType==='mouse'&&event.buttons===0){release(event);return;}
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!drag.moved&&Math.hypot(dx,dy)<=5)return;
      drag.moved=true;suppressClick=true;
      const rect=canvas.getBoundingClientRect();
      renderer.orbitAngle=drag.angle+dx/Math.max(1,rect.width)*Math.PI*2;
      if(renderer.networkView==='nebula')renderer.orbitTilt=Math.max(-.8,Math.min(.8,drag.pitch+dy/Math.max(1,rect.height)*2));
      syncCamera();refresh();return;
    }
    if(!network()||event.pointerType==='touch')return;
    const id=renderer.hitTest(event.clientX,event.clientY);
    const item=getEvents().find(e=>(e.id??e.index)===id);
    if(!item){clearHover();return;}
    const changed=renderer.hoveredId!==id;renderer.hoveredId=id;
    tooltipContent(item);tooltip.hidden=false;
    const box=host.getBoundingClientRect();
    tooltip.style.left=`${Math.max(6,Math.min(event.clientX-box.left+14,box.width-tooltip.offsetWidth-6))}px`;
    tooltip.style.top=`${Math.max(6,Math.min(event.clientY-box.top+14,box.height-tooltip.offsetHeight-6))}px`;
    if(changed)refresh();
  });
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',event=>{if(!drag||drag.id!==event.pointerId)return;release(event);suppressClick=false;clearHover();});
  canvas.addEventListener('lostpointercapture',event=>{if(drag?.id===event.pointerId)drag=null;});
  canvas.addEventListener('pointerleave',event=>{if(drag&&!canvas.hasPointerCapture(drag.id))release(event);clearHover();});
  canvas.addEventListener('click',event=>{if(suppressClick){event.stopImmediatePropagation();suppressClick=false;}},true);
  canvas.addEventListener('keydown',event=>{
    if(!network())return;
    if(['+','=','-','_','0'].includes(event.key)){
      event.preventDefault();event.stopPropagation();clearHover({redraw:false});
      if(event.key==='0'){resetCamera();return;}
      renderer.networkZoom=Math.max(1,Math.min(1.7,(renderer.networkZoom||1)+(['-','_'].includes(event.key)?-.1:.1)));syncCamera();refresh();
    }
  });
  return ()=>{
    const events=getEvents();
    const next=JSON.stringify(events.map(e=>[e.id??e.index,e.route,e.word??e.displayLabel??e.label]));
    if(next!==signature){signature=next;searchEvents();}
    if(renderer.hoveredId!=null){
      const current=events.find(e=>(e.id??e.index)===renderer.hoveredId);
      if(current)tooltipContent(current);else clearHover({redraw:false});
    }
  };
}
