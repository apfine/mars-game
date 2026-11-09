// Panel manager: double-click-to-move menus (PC), persisted layout, and
// "show only when needed" HUD detail levels. Pure DOM, no engine coupling.

const MOVABLE = [
  '.modal-card',
  '.spx-broadcast-bar',
  '.flight-ops-bar',
  '.flight-score-card',
  '.spx-trajectory-prompt',
  '.flight-attitude-gauge',
  '.spx-top-left',
  '.spx-top-right',
  '.career-panel',
  '.rover-broadcast-bar'
];
const INTERACTIVE = 'button, input, select, textarea, a, label, canvas, .spx-dropdown-menu';
const LAYOUT_KEY = 'mars.ui.layout.v1';
const DETAIL_KEY = 'mars.ui.hudDetail';
const IDLE_MS = 7000;

export function initPanelManager(root = document) {
  if (typeof window === 'undefined') return () => {};
  const selector = MOVABLE.join(',');
  let layout = {};
  try { layout = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); } catch (_) { layout = {}; }
  const save = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (_) {} };
  const keyOf = (el) => el.id || MOVABLE.find((s) => el.matches(s)) || 'panel';

  const apply = (el, x, y) => {
    el.style.translate = x || y ? `${Math.round(x)}px ${Math.round(y)}px` : '';
  };
  const restoreAll = () => {
    document.querySelectorAll(selector).forEach((el) => {
      const p = layout[keyOf(el)];
      if (p) apply(el, p.x, p.y);
    });
  };

  const clampDelta = (el, x, y, baseX, baseY) => {
    const r = el.getBoundingClientRect();
    const dx = x - baseX, dy = y - baseY;
    const minDx = -r.left, maxDx = window.innerWidth - r.right;
    const minDy = -r.top, maxDy = window.innerHeight - r.bottom;
    return [baseX + Math.min(Math.max(dx, Math.min(minDx, 0)), Math.max(maxDx, 0)),
      baseY + Math.min(Math.max(dy, Math.min(minDy, 0)), Math.max(maxDy, 0))];
  };

  let active = null; // element currently in move mode
  const setMovable = (el, on) => {
    if (active && active !== el) active.classList.remove('ui-movable');
    el.classList.toggle('ui-movable', on);
    active = on ? el : null;
  };

  const onDblClick = (e) => {
    if (e.pointerType === 'touch') return;
    if (e.target.closest(INTERACTIVE)) return;
    const el = e.target.closest(selector);
    if (!el) return;
    setMovable(el, !el.classList.contains('ui-movable'));
  };

  let drag = null;
  const onDown = (e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const el = e.target.closest('.ui-movable');
    if (!el || e.target.closest(INTERACTIVE)) return;
    const base = layout[keyOf(el)] || { x: 0, y: 0 };
    drag = { el, sx: e.clientX, sy: e.clientY, bx: base.x, by: base.y };
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!drag) return;
    const [x, y] = clampDelta(drag.el, drag.bx + e.clientX - drag.sx, drag.by + e.clientY - drag.sy, drag.bx, drag.by);
    layout[keyOf(drag.el)] = { x, y };
    apply(drag.el, x, y);
  };
  const onUp = () => { if (drag) { save(); drag = null; } };
  const onKey = (e) => { if (e.key === 'Escape' && active) setMovable(active, false); };

  // --- HUD detail: auto (fade when idle) / full / minimal ---
  let idleTimer = null;
  const setDetail = (mode) => {
    document.body.dataset.hudDetail = mode;
    try { localStorage.setItem(DETAIL_KEY, mode); } catch (_) {}
    const sel = document.getElementById('hud-detail-select');
    if (sel && sel.value !== mode) sel.value = mode;
  };
  const wake = () => {
    document.body.classList.remove('hud-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add('hud-idle'), IDLE_MS);
  };
  let detail = 'auto';
  try { detail = localStorage.getItem(DETAIL_KEY) || 'auto'; } catch (_) {}
  setDetail(detail);
  wake();

  const onChange = (e) => { if (e.target.id === 'hud-detail-select') setDetail(e.target.value); };
  const onClick = (e) => {
    if (e.target.id === 'btn-reset-layout') {
      layout = {}; save();
      document.querySelectorAll(selector).forEach((el) => apply(el, 0, 0));
    }
  };

  document.addEventListener('dblclick', onDblClick);
  document.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  document.addEventListener('change', onChange);
  document.addEventListener('click', onClick);
  ['pointermove', 'keydown', 'touchstart', 'wheel'].forEach((t) => window.addEventListener(t, wake, { passive: true }));
  const restoreTimer = setTimeout(restoreAll, 600);
  const sync = setTimeout(() => setDetail(detail), 1500); // select mounts with the HUD

  return () => {
    document.removeEventListener('dblclick', onDblClick);
    document.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('change', onChange);
    document.removeEventListener('click', onClick);
    ['pointermove', 'keydown', 'touchstart', 'wheel'].forEach((t) => window.removeEventListener(t, wake));
    clearTimeout(idleTimer); clearTimeout(restoreTimer); clearTimeout(sync);
  };
}
