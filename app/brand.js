/** Decorative logo motion has its own controls; it never changes scene playback. */
export async function startBrandMotion() {
  const fallback = document.querySelector('.wordmark img');
  const button = document.querySelector('#brandMotionToggle');
  if (!fallback || !button) return;
  try {
    const response = await fetch('/brand-mark.svg');
    if (!response.ok) return;
    const documentSvg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    if (documentSvg.querySelector('parsererror') || documentSvg.documentElement.localName !== 'svg') return;
    const mark = document.importNode(documentSvg.documentElement, true);
    mark.setAttribute('aria-hidden', 'true');
    mark.setAttribute('focusable', 'false');
    mark.removeAttribute('aria-labelledby');
    mark.removeAttribute('role');
    fallback.replaceWith(mark);
    button.hidden = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let paused = false, visible = true, suspended = false;
    function sync() {
      mark.dataset.motion = paused || reduced.matches || document.hidden || !visible || suspended ? 'paused' : 'running';
      button.disabled = reduced.matches;
      button.setAttribute('aria-pressed', String(!paused && !reduced.matches));
      button.title = reduced.matches ? '系统已开启减少动态效果' : paused ? '播放标志动画' : '暂停标志动画';
      button.querySelector('path').setAttribute('d', paused || reduced.matches ? 'M5 3 13 8 5 13Z' : 'M4 3H6V13H4ZM10 3H12V13H10Z');
    }
    button.addEventListener('click', () => { paused = !paused; sync(); });
    button.addEventListener('keydown', event => {
      if (event.code === 'Space') event.stopPropagation();
    });
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); });
    observer.observe(mark);
    window.addEventListener('pagehide', () => { suspended = true; sync(); });
    window.addEventListener('pageshow', () => { suspended = false; sync(); });
    sync();
  } catch {
    // A blocked or unavailable optional asset leaves the existing static icon intact.
  }
}
