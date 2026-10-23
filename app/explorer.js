/** Shared controls for demo and Agent/replay renderers. No additional data collection. */
export function mountExplorer({renderer, refresh, getEvents, select, toast}) {
  const heading = document.querySelector('.view-heading');
  const toolbar = document.createElement('div');
  toolbar.className = 'explorer';
  toolbar.innerHTML = `<div class="explorer-views" role="group" aria-label="网络视图"><button id="classicView" aria-pressed="true">经典蛛网</button><button id="orbitView" aria-pressed="false">星轨网络</button></div><label class="explorer-search"><span class="sr-only">搜索已出现的词条或事件</span><input id="nodeSearch" type="search" maxlength="200" placeholder="搜索词条 / 事件" autocomplete="off"></label><button id="snapshotBtn">保存 PNG</button><div id="nodeResults" class="node-results" aria-label="搜索结果" hidden></div>`;
  heading.after(toolbar);
  const search = toolbar.querySelector('#nodeSearch'), results = toolbar.querySelector('#nodeResults');
  const rotation = document.createElement('label'); rotation.className = 'orbit-rotation'; rotation.hidden = true;
  rotation.innerHTML = '旋转 <input id="orbitRotation" aria-label="星轨旋转角度" type="range" min="-180" max="180" value="0">';
  toolbar.querySelector('#snapshotBtn').before(rotation);
  rotation.querySelector('input').addEventListener('input', event => { renderer.orbitAngle = Number(event.target.value) / 180 * Math.PI; refresh(); });
  function searchEvents() {
    const query = search.value.trim(); renderer.searchQuery = query;
    results.replaceChildren(); results.hidden = !query;
    if (query) {
      const items = getEvents().filter(e => String(e.word ?? e.displayLabel ?? e.label).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      const note = document.createElement('span'); note.textContent = `${items.length} 个匹配 · 当前时间点 / 当前页`; results.append(note);
      for (const event of items.slice(0, 12)) {
        const button = document.createElement('button'); button.textContent = `${event.word ?? event.displayLabel ?? event.label} → ${event.route}`;
        button.addEventListener('click', () => { select(event.id ?? event.index); }); results.append(button);
      }
    }
  }
  search.addEventListener('input', () => { searchEvents(); refresh(); });
  for (const [id, mode] of [['classicView','classic'], ['orbitView','orbit']]) {
    toolbar.querySelector('#' + id).addEventListener('click', () => {
      renderer.networkView = mode;
      rotation.hidden = mode !== 'orbit';
      for (const button of toolbar.querySelectorAll('.explorer-views button')) button.setAttribute('aria-pressed', String(button.id === id));
      refresh();
    });
  }
  toolbar.querySelector('#snapshotBtn').addEventListener('click', () => {
    refresh();
    renderer.canvas.toBlob(blob => {
      if (!blob) { toast('保存失败，请重试'); return; }
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `prompt-spider-${renderer.networkView || 'classic'}.png`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已保存当前画面 PNG');
    }, 'image/png');
  });
  let drag = null, suppressClick = false;
  const canvas = renderer.canvas;
  canvas.addEventListener('pointerdown', event => {
    if (renderer.networkView !== 'orbit' || event.button !== 0) return;
    suppressClick = false;
    drag = {x:event.clientX, angle:renderer.orbitAngle || 0, id:event.pointerId};
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    if (Math.abs(event.clientX - drag.x) > 5) { suppressClick = true; canvas.setPointerCapture(event.pointerId); }
    renderer.orbitAngle = drag.angle + (event.clientX - drag.x) / Math.max(1,canvas.getBoundingClientRect().width) * Math.PI * 2;
    rotation.querySelector('input').value = String(Math.atan2(Math.sin(renderer.orbitAngle), Math.cos(renderer.orbitAngle)) * 180 / Math.PI);
    refresh();
  });
  function release(event) { if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId); drag = null; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', event => { release(event); suppressClick = false; });
  canvas.addEventListener('click', event => { if (suppressClick) { event.stopImmediatePropagation(); suppressClick = false; } }, true);
  // Refresh results only as data changes, not for every animation frame.
  let signature = '';
  return () => { const next = JSON.stringify(getEvents().map(e=>[e.id ?? e.index,e.route,e.word ?? e.displayLabel ?? e.label])); if(next!==signature){signature=next;searchEvents();} };
}
