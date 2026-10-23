import { mountExplorer } from './explorer.js';
import { LiveRenderer } from './live-renderer.js';
import { SessionProjection, validateRecord } from '/lib/replay.js';
import { SessionStore } from '/lib/session-store.js';
import { ROUTES, tokenizePrompt } from '/lib/config.js';
import { PAGE_SIZE, resolveCursor, parseSseFrames } from './live-layout.js';

const $=selector=>document.querySelector(selector);
const STATUS={pending:'等待',running:'进行中',completed:'已完成',failed:'失败'};

export async function startLive(project={}) {
  document.body.classList.add('live-session');
  $('#scene').setAttribute('aria-label','Agent 真实事件可视化：任务、蛛网分流和已上报统计，点击事件查看详情。');
  $('.panel-intro').innerHTML='<span class="eyebrow">YOUR AGENT, YOUR WEB</span><h1 id="liveTitle">让真实任务<br>结成一张网。</h1><p id="liveDescription">由 Agent 主动上报事件。暂停观看不会停止后台接收。</p>';
  $('.wordmark').setAttribute('href','/');
  $('.wordmark span').textContent='AGENT INTERFACE';
  document.querySelectorAll('.control-section').forEach(section=>section.remove());
  $('#exportBtn').textContent='导出会话回放 JSON ↓';
  $('.footnote').textContent='分支代表 Agent 上报的类别；UI 不执行任务。未上报的指标显示为未提供。';
  $('#exportBtn').insertAdjacentHTML('beforebegin',`
    <section class="control-section"><div class="section-title">查看事件 <span>01</span></div>
      <div id="liveFilters" class="filters" aria-label="分支筛选"><button data-live-route="all" class="active">全部</button>${ROUTES.map(route=>`<button data-live-route="${route}">${route}</button>`).join('')}</div>
      <div class="live-pagination"><button id="previousPage" aria-label="上一页">←</button><span id="pageText">1 / 1</span><button id="nextPage" aria-label="下一页">→</button></div>
      <div id="selection" class="selection"><span class="muted">点击画布中的事件，查看 Agent 上报的内容。</span></div></section>
    <section class="control-section"><div class="section-title">布局与外观 <span>02</span></div>
      <form id="liveConfig" class="live-form">
        <label for="layoutInput">画布布局</label><select id="layoutInput"><option value="portrait">竖屏 · 1080 × 1350</option><option value="landscape">横屏 · 1600 × 900</option><option value="square">方形 · 1080 × 1080</option></select>
        <label for="titleInput">标题</label><input id="titleInput" maxlength="80" required>
        <label for="modelInput">模型 / Agent 名称</label><input id="modelInput" maxlength="80" required>
        <div class="live-color-row"><label>核心 <input id="accentInput" type="color"></label><label>蜘蛛 <input id="spiderInput" type="color"></label><label>背景 <input id="backgroundInput" type="color"></label></div>
        ${ROUTES.map(route=>`<div class="live-route-input"><label for="label-${route}">${route}</label><input id="label-${route}" maxlength="40" required aria-label="${route} 分支名称"><input id="color-${route}" type="color" aria-label="${route} 分支颜色"></div>`).join('')}
        <label for="livePrompt">提示词</label><textarea id="livePrompt" rows="4" maxlength="12000" spellcheck="false"></textarea>
        <p id="promptLock" class="muted">逐词事件通过 tokenIndex 与提示词对应。</p><button class="primary" type="submit">应用外观</button><span id="configResult" role="status"></span>
      </form></section>
    <label for="replayInput" class="export live-import">导入会话回放 JSON ↑</label><input id="replayInput" class="sr-only" type="file" accept="application/json,.json">`);
  $('#restartBtn').insertAdjacentHTML('afterend','<button id="followLiveBtn" class="live-follow">返回实时</button>');
  $('#loop').checked=false;
  $('#aboutDialog').querySelectorAll('p').forEach(p=>p.remove());
  $('#aboutDialog').insertAdjacentHTML('beforeend','<p>实时模式接收 Agent 通过 MCP 上报的步骤或逐词事件。相同事件 ID 会更新状态，UI 不把重复更新当成新任务，也不会生成未提供的分数、预计总量或模型调用数。</p><p>暂停和拖动时间轴只冻结观看位置，事件仍在后台接收。点击“返回实时”回到最新状态。回放 JSON 保留上报历史、相对时间和外观变更，可以离线导入。</p><p class="muted">快捷键：空格播放 / 暂停，R 重播，F 沉浸模式，Esc 退出；左右方向键前后跳转。</p>');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches,canvas=$('#scene');
  const renderer=new LiveRenderer(canvas,{onSelect:selectEvent});
  let sessionId=new URLSearchParams(location.search).get('session'),remote=Boolean(sessionId),token='',meta=null,record=null,projection=null,anchor=performance.now(),selectedId=null,drawerOpen=false,connection='正在连接',streamAbort=null,toastTimer,lastUi=0,lastConfig=null,lastView=null,localStore=null,localId=null,reconnectTimer=null,closed=false,visiblePage=0,wordConfig=null,wordTokens=[];
  const capabilities=new URLSearchParams(location.hash.slice(1));
  if(capabilities.has('token')){token=capabilities.get('token');sessionStorage.setItem('prompt-spider-token',token);history.replaceState(null,'',location.pathname+location.search);}
  else token=sessionStorage.getItem('prompt-spider-token')||'';
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000);}
  function drawer(open,{focus=true}={}){drawerOpen=open;const visible=open&&!document.body.classList.contains('immersive');document.body.classList.toggle('drawer-open',open);$('#inspector').inert=!visible;$('#inspector').setAttribute('aria-hidden',String(!visible));$('#inspectorToggle').setAttribute('aria-expanded',String(visible));$('#inspectorToggle').setAttribute('aria-label',visible?'收起控制栏':'展开控制栏');$('#inspectorBackdrop').hidden=!visible;if(focus)(open?$('#inspectorClose'):$('#inspectorToggle')).focus({preventScroll:true});}
  function immersive(){document.body.classList.toggle('immersive');drawer(drawerOpen,{focus:false});if(document.body.classList.contains('immersive'))canvas.focus({preventScroll:true});}
  async function api(path,{method='GET',body}={}){
    const response=await fetch(`/api/sessions/${encodeURIComponent(sessionId)}${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
    const data=await response.json();if(!response.ok)throw Error(data.error||`请求失败 (${response.status})`);return data;
  }
  function receiveSnapshot(snapshot){if(meta&&remote&&snapshot.id===meta.id&&snapshot.revision<meta.revision)return;record=snapshot;projection=new SessionProjection(snapshot);meta=snapshot;anchor=performance.now();lastConfig=null;closed=false;render(true);}
  function receiveMessage(message){
    if(message.type==='snapshot'){receiveSnapshot(message.snapshot);return;}
    if(message.type==='closed'){closed=true;connection='会话已关闭';streamAbort?.abort();toast('会话已关闭。已显示的内容仍可查看；请使用已导出的 JSON 保存回放。');render(true);return;}
    if(!projection)return;
    if(message.entry){projection.append([message.entry]);record.log=projection.entries;}
    if(message.meta&&message.meta.revision>=meta.revision){meta={...meta,...message.meta};anchor=performance.now();}
    render(true);
  }
  async function connect(){
    if(!remote||closed)return;
    streamAbort?.abort();const controller=new AbortController();streamAbort=controller;
    try{
      connection='正在连接';render(true);
      if(!token)throw Error('预览令牌缺失。请从 Agent 返回的完整预览地址打开此页面。');
      const response=await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/events`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
      if(!response.ok){const error=await response.json();throw Error(error.error||`连接失败 (${response.status})`);}
      connection='实时连接';const reader=response.body.getReader(),decoder=new TextDecoder();let buffered='';
      while(remote&&!closed){const {value,done}=await reader.read();if(done)break;buffered+=decoder.decode(value,{stream:true});const parsed=parseSseFrames(buffered);buffered=parsed.rest;for(const message of parsed.messages)receiveMessage(message);}
      if(!controller.signal.aborted&&!closed)throw Error('实时连接中断');
    }catch(error){if(controller.signal.aborted)return;connection=token?'连接中断 · 正在重连':'缺少预览令牌';toast(error.message);render(true);if(remote&&!closed&&token)reconnectTimer=setTimeout(connect,2500);}
  }
  async function control(command){
    try{if(remote){const result=await api('/control',{method:'POST',body:command});if(result.revision>=meta.revision){meta={...meta,...result};anchor=performance.now();}}else{localStore.control(localId,command);meta=localStore.snapshot(localId);anchor=performance.now();}render(true);}catch(error){toast(error.message);}
  }
  function cursor(){return meta?resolveCursor(meta,closed?0:performance.now()-anchor):0;}
  function selectEvent(id){selectedId=id;drawer(true,{focus:false});updateSelection();render(true);}
  function updateSelection(){
    const box=$('#selection');box.replaceChildren();
    const event=projection?.state.byId.get(selectedId);
    if(!event){const note=document.createElement('span');note.className='muted';note.textContent='点击画布中的事件，查看 Agent 上报的内容。';box.append(note);return;}
    const title=document.createElement('strong');title.className='selected-word';title.textContent=event.label;box.append(title);const list=document.createElement('dl');
    const entries=[['ID',event.id],['分支',lastView?.config.routes[event.route].label??event.route],['状态',STATUS[event.status]],['分数',event.score===null?'未提供':String(event.score)],['首次',`${event.firstAt.toFixed(3)} s`],['更新',`${event.updatedAt.toFixed(3)} s`]];
    if(event.tokenIndex!==null){entries.push(['词索引',event.tokenIndex]);const token=tokenizePrompt(lastView.config.prompt).tokens[event.tokenIndex];if(token)entries.push(['原词',token.word]);}
    if(event.occurredAt)entries.push(['时间',event.occurredAt]);
    for(const [name,value] of entries){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=String(value);list.append(dt,dd);}box.append(list);
    if(event.detail){const detail=document.createElement('p');detail.className='live-detail';detail.textContent=event.detail;box.append(detail);}
  }
  function syncConfig(config){
    $('#livePrompt').disabled=Boolean(meta.totalEvents);$('#promptLock').textContent=meta.totalEvents?'已有事件：提示词与任务单位已锁定，新提示词请创建新会话。':'逐词事件通过 tokenIndex 与提示词对应。';
    if(lastConfig===config)return;lastConfig=config;const t=config.theme;
    for(const [name,value] of Object.entries({bg:t.background,panel:t.panel,border:t.border,text:t.text,muted:t.muted,pink:t.accent,code:config.routes.code.color,model:config.routes.model.color,you:config.routes.you.color}))document.documentElement.style.setProperty(`--${name}`,value);
    document.title=`${config.title} · Prompt Spider`;$('#liveTitle').textContent=config.title;$('.view-heading>span').lastChild.textContent=` ${config.subtitle||'EVERY TASK, ONE FORK'}`;$('.local').textContent=remote?'MCP SESSION':'LOCAL REPLAY';
    if(!$('#liveConfig').contains(document.activeElement)){
      $('#layoutInput').value=config.layout;$('#titleInput').value=config.title;$('#modelInput').value=config.modelName;$('#accentInput').value=t.accent;$('#spiderInput').value=t.spider;$('#backgroundInput').value=t.background;$('#livePrompt').value=config.prompt;
      for(const route of ROUTES){$(`#label-${route}`).value=config.routes[route].label;$(`#color-${route}`).value=config.routes[route].color;}
    }
    for(const route of ROUTES)$(`[data-live-route="${route}"]`).textContent=config.routes[route].label;
    canvas.style.aspectRatio=config.layout==='portrait'?'4/5':config.layout==='landscape'?'16/9':'1/1';document.body.dataset.layout=config.layout;
  }
  function render(force=false){
    if(!projection||!meta)return;const at=cursor(),filter=meta.playback.routeFilter||'all';let page=meta.playback.page||0;
    let view=projection.view(at,{offset:page*PAGE_SIZE,limit:PAGE_SIZE});const maxPage=Math.max(0,Math.ceil(view.totalEvents/PAGE_SIZE)-1);if(page>maxPage){page=maxPage;view=projection.view(at,{offset:page*PAGE_SIZE,limit:PAGE_SIZE});}visiblePage=page;lastView=view;syncConfig(view.config);
    if(view.config.unit==='word'){if(wordConfig!==view.config){wordConfig=view.config;wordTokens=tokenizePrompt(view.config.prompt).tokens;}view={...view,events:view.events.map(event=>({...event,displayLabel:wordTokens[event.tokenIndex]?.word??event.label}))};}
    lastView=view;
    renderer.render(view,{time:at,reducedMotion,selectedId,page,routeFilter:filter,connection});
    updateExplorer();
    const now=performance.now();if(!force&&now-lastUi<100)return;lastUi=now;
    const liveSource=meta.status==='live'&&meta.source!=='replay'&&!closed,maximum=liveSource?meta.elapsed+(now-anchor)/1000:meta.duration;
    $('#timeline').max=String(Math.max(.01,maximum));$('#timeline').value=String(at);$('#timeText').textContent=`${at.toFixed(2)} / ${maximum.toFixed(2)}`;
    const isPlaying=meta.playback.mode!=='paused'&&!closed;$('#playBtn').textContent=isPlaying?'暂停':'播放';$('#playBtn').setAttribute('aria-label',isPlaying?'暂停':'播放');$('#frameStatus').textContent=`${connection} · ${view.totalEvents} events · ${meta.playback.mode==='live'?'跟随实时':'回看'}`;
    $('#followLiveBtn').disabled=!liveSource;$('#followLiveBtn').classList.toggle('active',meta.playback.mode==='live');$('#loop').disabled=liveSource;$('#loop').checked=meta.playback.loop;$('#speed').value=String(meta.playback.speed);
    const pages=Math.max(1,Math.ceil(view.totalEvents/PAGE_SIZE));$('#pageText').textContent=`${page+1} / ${pages}`;$('#previousPage').disabled=page<=0;$('#nextPage').disabled=page>=pages-1;
    document.querySelectorAll('[data-live-route]').forEach(button=>button.classList.toggle('active',button.dataset.liveRoute===filter));updateSelection();
  }
  function localReplay(input){
    const valid=validateRecord(input);clearTimeout(reconnectTimer);remote=false;streamAbort?.abort();localStore=new SessionStore();const snapshot=localStore.importRecord(valid);localId=snapshot.id;sessionId=null;connection='离线回放';selectedId=null;receiveSnapshot(snapshot);$('#liveDescription').textContent='离线回放 · 导入的记录仅保存在当前页面内存。';
  }
  function download(payload){const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='prompt-spider-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('#playBtn').addEventListener('click',()=>control({action:meta?.playback.mode==='paused'?'play':'pause'}));$('#restartBtn').addEventListener('click',()=>control({action:'restart'}));$('#followLiveBtn').addEventListener('click',()=>control({action:'follow_live'}));
  $('#timeline').addEventListener('input',event=>control({action:'seek',position:Number(event.target.value)}));$('#speed').addEventListener('change',event=>control({speed:Number(event.target.value)}));$('#loop').addEventListener('change',event=>control({loop:event.target.checked}));
  document.querySelectorAll('[data-live-route]').forEach(button=>button.addEventListener('click',()=>control({routeFilter:button.dataset.liveRoute})));
  $('#previousPage').addEventListener('click',()=>control({page:Math.max(0,visiblePage-1)}));$('#nextPage').addEventListener('click',()=>control({page:visiblePage+1}));
  $('#liveConfig').addEventListener('submit',async event=>{
    event.preventDefault();const routes=Object.fromEntries(ROUTES.map(route=>[route,{label:$(`#label-${route}`).value,color:$(`#color-${route}`).value}])),patch={layout:$('#layoutInput').value,title:$('#titleInput').value,modelName:$('#modelInput').value,routes,theme:{accent:$('#accentInput').value,spider:$('#spiderInput').value,background:$('#backgroundInput').value}};
    if(!$('#livePrompt').disabled)patch.prompt=$('#livePrompt').value;
    try{if(remote){await api('/configure',{method:'POST',body:patch});receiveSnapshot(await api(''));}else{localStore.configure(localId,patch);receiveSnapshot(localStore.snapshot(localId));}const earlier=cursor()<meta.elapsed-.05;$('#configResult').textContent=earlier?'已保存到最新时间点':'已应用';toast(earlier?'外观已保存到最新时间点；回到最新时间查看。':'外观已更新；回看更早时间将恢复当时样式。');}catch(error){$('#configResult').textContent=error.message;toast(error.message);}
  });
  $('#exportBtn').addEventListener('click',async()=>{try{download(remote?await api('/export'):localStore.record(localId));toast('已导出会话与完整回放历史');}catch(error){toast(error.message);}});
  $('#replayInput').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>64*1024*1024)throw Error('回放文件过大，最大 64 MiB');localReplay(JSON.parse(await file.text()));toast('回放已导入，点击播放开始');}catch(error){toast(error.message);}event.target.value='';});
  $('#inspectorToggle').addEventListener('click',()=>drawer(!drawerOpen));$('#inspectorClose').addEventListener('click',()=>drawer(false));$('#inspectorBackdrop').addEventListener('click',()=>drawer(false));
  $('#fitBtn').addEventListener('click',()=>{const zoom=document.body.classList.toggle('zoom');$('#fitBtn').textContent=zoom?'适应窗口':'放大画布';$('#fitBtn').setAttribute('aria-pressed',String(zoom));});$('#fullscreenBtn').addEventListener('click',immersive);
  $('#aboutBtn').addEventListener('click',()=>$('#aboutDialog').showModal());$('#closeAbout').addEventListener('click',()=>$('#aboutDialog').close());
  document.addEventListener('pointerdown',event=>{if(drawerOpen&&!document.body.classList.contains('immersive')&&!$('#inspector').contains(event.target)&&!$('#inspectorToggle').contains(event.target)&&event.target!==$('#inspectorBackdrop'))drawer(false,{focus:false});});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#aboutDialog').open){if(document.body.classList.contains('immersive'))immersive();else drawer(false);return;}if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||$('#aboutDialog').open||!meta)return;if(event.code==='Space'){event.preventDefault();control({action:meta.playback.mode==='paused'?'play':'pause'});}else if(event.key.toLowerCase()==='r')control({action:'restart'});else if(event.key.toLowerCase()==='f')immersive();else if(event.key==='ArrowRight')control({action:'seek',position:cursor()+.5});else if(event.key==='ArrowLeft')control({action:'seek',position:Math.max(0,cursor()-.5)});});
  window.addEventListener('resize',()=>render(true));window.addEventListener('beforeunload',()=>streamAbort?.abort());
  window.spiderLive={getState:()=>lastView,getMeta:()=>meta,renderer,control,loadReplay:localReplay,selectEvent,render:()=>render(true)};
  const updateExplorer=mountExplorer({renderer,refresh:()=>render(true),getEvents:()=>lastView?.events.filter(e=>!meta.playback.routeFilter||meta.playback.routeFilter==='all'||e.route===meta.playback.routeFilter)||[],select:selectEvent,toast});
  drawer(false,{focus:false});
  try{
    if(remote){if(!token)throw Error('预览令牌缺失。请使用 Agent 返回的完整预览地址。');receiveSnapshot(await api(''));connect();}
    else{const {replayFile,...config}=project;if(replayFile){if(!/^[a-zA-Z0-9._-]+\.json$/.test(replayFile))throw Error('replayFile 必须是项目根目录中的 JSON 文件名');const response=await fetch(`/${replayFile}`);if(!response.ok)throw Error('未找到项目回放文件');localReplay(await response.json());}
      else{localStore=new SessionStore();const snapshot=localStore.create(config);localId=snapshot.id;connection='本地项目 · 等待导入';receiveSnapshot(snapshot);}}
  }catch(error){connection='无法打开会话';$('#stageHost').insertAdjacentHTML('beforeend','<p id="liveError" role="alert"></p>');$('#liveError').textContent=error.message;toast(error.message);drawer(true,{focus:false});}
  function tick(){render();requestAnimationFrame(tick);}requestAnimationFrame(tick);
}
