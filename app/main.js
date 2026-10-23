import { mountExplorer } from './explorer.js';
import { Renderer } from './renderer.js';
import { referenceRun, customRun, stateAt } from './model.js';

const $ = selector => document.querySelector(selector);
const source = await fetch('/prompt.txt').then(response => { if (!response.ok) throw Error('Prompt source unavailable'); return response.text(); });
let run = referenceRun(source), elapsed = 0, playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let speed = 1, threshold = 0.95, routeFilter = 'all', selectedIndex = null, lastFrame = null, toastTimer;
let drawerOpen = false;
const canvas = $('#scene'), reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderer = new Renderer(canvas, { onSelect: selectWord });
$('#promptInput').value = source;

function getState() { return stateAt(run, elapsed, { playing, threshold, selectedIndex, routeFilter, reducedMotion }); }
function selectWord(index) {
  if (index == null) return;
  selectedIndex = index;
  updateSelection();
  setDrawerOpen(true, { focus: false });
  if (!playing) render();
}
function syncDrawerVisibility() {
  const visible = drawerOpen && !document.body.classList.contains('immersive');
  const inspector = $('#inspector'), toggle = $('#inspectorToggle');
  document.body.classList.toggle('drawer-open', drawerOpen);
  inspector.inert = !visible;
  inspector.setAttribute('aria-hidden', String(!visible));
  toggle.setAttribute('aria-expanded', String(visible));
  toggle.setAttribute('aria-label', visible ? '收起控制栏' : '展开控制栏');
  toggle.title = visible ? '收起控制栏' : '展开控制栏';
  $('#inspectorBackdrop').hidden = !visible;
}
function setDrawerOpen(open, { focus = true } = {}) {
  drawerOpen = open;
  syncDrawerVisibility();
  if (focus) (open ? $('#inspectorClose') : $('#inspectorToggle')).focus({ preventScroll: true });
}
function updateSelection() {
  const d = getState().decisions.find(item => item.index === selectedIndex);
  const el = $('#selection');
  el.replaceChildren();
  if (!d) {
    const intro = document.createElement('span'); intro.className = 'muted'; intro.textContent = selectedIndex === null ? '点击画布中的词条或决策流' : '这个词尚未扫描';
    const title = document.createElement('strong'); title.textContent = selectedIndex === null ? '每个词，都是一次分叉。' : (run.tokens[selectedIndex]?.word || '');
    const note = document.createElement('span'); note.className = 'muted'; note.textContent = '查看问题、示意分数，以及它被送往哪里。';
    el.append(intro, title, note); return;
  }
  const word = document.createElement('strong'); word.className = 'selected-word'; word.textContent = d.word;
  const list = document.createElement('dl');
  for (const [key, val] of [['问题', d.question], ['分数', d.score.toFixed(3) + ' · 示意'], ['分支', d.route === 'model' ? 'model · 待处理' : d.route === 'you' ? 'you · 待批准' : 'code · 演示']]) {
    const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = key; dd.textContent = val;
    dd.style.color = d.route === 'code' ? 'var(--code)' : d.route === 'model' ? 'var(--model)' : 'var(--you)'; list.append(dt, dd);
  }
  el.append(word, list);
}
function render() {
  const state = getState(); renderer.render(state);
  if (typeof updateExplorer === 'function') updateExplorer();
  $('#timeline').value = String(elapsed);
  $('#timeText').textContent = `${elapsed.toFixed(2).padStart(5, '0')} / ${run.duration.toFixed(2)}`;
  $('#playBtn').textContent = playing ? '暂停' : '播放';
  $('#playBtn').setAttribute('aria-label', playing ? '暂停' : '播放');
  $('#frameStatus').textContent = `${run.mode === 'reference' ? '参考演示' : '本地规则'} · ${state.decisions.length} forks`;
}
function tick(now) {
  const shouldRender = playing;
  if (playing && lastFrame !== null) {
    elapsed += Math.min((now - lastFrame) / 1000, .15) * speed;
    if (elapsed >= run.duration) {
      if ($('#loop').checked) { elapsed %= run.duration; selectedIndex = null; }
      else { elapsed = run.duration; playing = false; }
    }
  }
  lastFrame = now;
  if (shouldRender) render();
  requestAnimationFrame(tick);
}
function togglePlayback() { if (!playing && elapsed >= run.duration) elapsed = 0; playing = !playing; render(); }
function restart() { elapsed = 0; selectedIndex = null; playing = true; updateSelection(); render(); }
function seek(value) { elapsed = Math.max(0, Math.min(run.duration, Number(value))); updateSelection(); render(); }
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2400); }
function setMode(mode, { reset = true } = {}) {
  if (mode === 'reference') {
    threshold = .95; $('#threshold').value = '.95'; $('#thresholdValue').value = '0.95';
    run = referenceRun(source);
  } else run = customRun($('#promptInput').value, threshold);
  const custom = mode === 'custom';
  $('#promptEditor').hidden = !custom;
  for (const [id, active] of [['referenceMode', !custom], ['customMode', custom]]) { $('#' + id).classList.toggle('active', active); $('#' + id).setAttribute('aria-pressed', active); }
  $('#modeDescription').textContent = custom ? '修改提示词，观察本地规则如何改变决策网络。' : '固定提示词与轨迹展示逐词分流；分数为演示值，未连接模型。';
  $('#wordCount').textContent = `${run.tokens.length} tokens`;
  selectedIndex = null;
  if (reset) { elapsed = 0; playing = false; }
  updateSelection(); render();
}

$('#playBtn').addEventListener('click', togglePlayback);
$('#restartBtn').addEventListener('click', restart);
$('#timeline').addEventListener('input', event => { playing = false; seek(event.target.value); });
$('#speed').addEventListener('change', event => { speed = Number(event.target.value); });
$('#referenceMode').addEventListener('click', () => { setMode('reference'); playing = true; });
$('#customMode').addEventListener('click', () => setMode('custom'));
$('#promptInput').addEventListener('input', () => { $('#wordCount').textContent = `${$('#promptInput').value.trim().split(/\s+/u).filter(Boolean).length} groups`; });
$('#runBtn').addEventListener('click', () => {
  if (!$('#promptInput').value.trim()) { toast('先输入一段提示词'); $('#promptInput').focus(); return; }
  setMode('custom'); playing = true;
});
$('#threshold').addEventListener('input', event => {
  threshold = Number(event.target.value); $('#thresholdValue').value = threshold.toFixed(2);
  const time = elapsed, wasPlaying = playing; setMode('custom', { reset: false }); elapsed = time; playing = wasPlaying; render();
});
document.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => {
  routeFilter = button.dataset.route;
  document.querySelectorAll('[data-route]').forEach(item => item.classList.toggle('active', item === button)); render();
}));
$('#fitBtn').addEventListener('click', () => { const zoom = document.body.classList.toggle('zoom'); $('#fitBtn').textContent = zoom ? '适应窗口' : '放大画布'; $('#fitBtn').setAttribute('aria-pressed', zoom); });
$('#inspectorToggle').addEventListener('click', () => setDrawerOpen(!drawerOpen));
$('#inspectorClose').addEventListener('click', () => setDrawerOpen(false));
$('#inspectorBackdrop').addEventListener('click', () => setDrawerOpen(false));
document.addEventListener('pointerdown', event => {
  if (drawerOpen && !document.body.classList.contains('immersive') && !$('#inspector').contains(event.target) && !$('#inspectorToggle').contains(event.target) && event.target !== $('#inspectorBackdrop')) setDrawerOpen(false, { focus: false });
});
function immersive() {
  document.body.classList.toggle('immersive');
  syncDrawerVisibility();
  if (document.body.classList.contains('immersive')) { canvas.focus({ preventScroll: true }); toast('F 或 Esc 退出全屏'); }
}
$('#fullscreenBtn').addEventListener('click', immersive);
$('#aboutBtn').addEventListener('click', () => $('#aboutDialog').showModal());
$('#closeAbout').addEventListener('click', () => $('#aboutDialog').close());
$('#exportBtn').addEventListener('click', () => {
  const state = getState();
  const payload = { format: 'prompt-spider-demo/v1', mode: run.mode, provenance: run.provenance, threshold, elapsed, displayedTotal: state.total, transcribedTokens: state.tokens.length, read: state.read, counts: state.counts, decisions: state.decisions, calibratedProbabilities: false, modelCalls: 0, executedActions: 0 };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `prompt-spider-${run.mode}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已导出当前时间点的演示分流');
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#aboutDialog').open) {
    if (document.body.classList.contains('immersive')) { document.body.classList.remove('immersive'); syncDrawerVisibility(); $('#fullscreenBtn').focus({ preventScroll: true }); }
    else if (drawerOpen) setDrawerOpen(false);
    return;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || $('#aboutDialog').open) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
  else if (event.key.toLowerCase() === 'r') restart();
  else if (event.key.toLowerCase() === 'f') immersive();
  else if (event.key === 'ArrowRight') { playing = false; seek(elapsed + .5); }
  else if (event.key === 'ArrowLeft') { playing = false; seek(elapsed - .5); }
});
window.addEventListener('resize', render);
// Deterministic time control for inspection, screenshots and optional offline capture.
window.spider = { getState, seek, pause: () => { playing = false; render(); }, play: () => { playing = true; }, selectWord, setMode, loadPrompt: text => { $('#promptInput').value = text; setMode('custom'); }, renderer };
const updateExplorer = mountExplorer({renderer, refresh:render, getEvents:()=>getState().decisions.filter(e=>routeFilter==='all'||e.route===routeFilter), select:selectWord, toast});
$('#wordCount').textContent = `${run.tokens.length} groups`;
syncDrawerVisibility();
updateSelection(); render(); requestAnimationFrame(tick);
