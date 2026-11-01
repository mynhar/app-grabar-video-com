// Draws the round camera bubble and the recording controls of Capas on top of the page while a recording
// is active. Only visible tabs draw it, so the camera (camera.html in an iframe) runs in one tab at a time.
(() => {
  if (window.__capasBubble) return;
  window.__capasBubble = true;

  const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  const MIN_SIZE = 96;
  const MAX_SIZE = 480;

  const paths = {
    webcam: '<circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="2.5"/><path d="M8 21h8M12 17v4"/>',
    webcamOff: '<circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="2.5"/><path d="M8 21h8M12 17v4M3 3l18 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  };
  const icon = (name) => (name === 'play'
    ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>'
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`);

  const CSS = `
*{box-sizing:border-box}[hidden]{display:none!important}
.bubble{position:relative;width:var(--size,200px);height:var(--size,200px)}
.cam{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:#0E222D;box-shadow:0 0 0 4px #3EC5B5,0 16px 40px rgba(23,49,63,.35);cursor:grab;touch-action:none}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}
.msg{position:absolute;inset:0;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16%;background:#17313F;font-size:13px;line-height:1.35;text-align:center}
.tools{position:absolute;left:50%;top:-16px;transform:translateX(-50%);display:flex;gap:4px;padding:4px;border-radius:999px;background:#17313F;box-shadow:0 8px 20px rgba(23,49,63,.3);opacity:0;transition:opacity .15s}
.bubble:hover .tools,.bubble:focus-within .tools{opacity:1}
.bar{display:flex;align-items:center;gap:6px;padding:5px 5px 5px 12px;border-radius:999px;background:rgba(14,34,45,.92);box-shadow:0 6px 18px rgba(0,0,0,.35);white-space:nowrap;cursor:grab;touch-action:none}
.dragging,.dragging .cam{cursor:grabbing}
.dot{width:9px;height:9px;border-radius:50%;background:#E5484D;animation:pulse 1.4s ease-in-out infinite}
.paused .dot{animation:none;background:#8FB0C0}
@keyframes pulse{50%{opacity:.35}}
.time{min-width:38px;font-variant-numeric:tabular-nums}
button{all:unset;box-sizing:border-box;cursor:pointer;width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.12);color:#fff}
button:hover{background:rgba(255,255,255,.24)}
button:focus-visible{outline:2px solid #3EC5B5;outline-offset:2px}
button:disabled{opacity:.4;cursor:default}
.stop{background:#E5484D}.stop:hover{background:#CF3B40}
.msg button{width:auto;height:auto;padding:7px 12px;border-radius:999px;background:#3EC5B5;color:#0E222D;font-weight:600}
.msg button:hover{background:#62D2C5}
.saving button{opacity:.4;pointer-events:none}
svg{width:16px;height:16px}
@media (prefers-reduced-motion:reduce){.dot{animation:none}.tools{transition:none}}`;

  const camErrors = {
    permission: 'Capas no tiene permiso para usar la cámara.',
    blocked: 'Esta página no permite mostrar la cámara.',
    missing: 'No se encontró la cámara.',
    busy: 'No se pudo abrir la cámara.',
  };

  let rec = null;
  const place = { x: 24, b: 24, size: 200 };
  let host = null;
  let ui = null;
  let timer = 0;
  let saveTimer = 0;

  const alive = () => !!chrome.runtime?.id;
  const send = (msg) => { if (alive()) chrome.runtime.sendMessage(msg).catch(() => {}); };
  const save = () => { clearTimeout(saveTimer); if (alive()) chrome.storage.local.set({ bubble: { ...place } }); };
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); };

  function fmt(ms) {
    const t = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = String(t % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }

  function setBtn(button, name, label) {
    button.innerHTML = icon(name);
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  function mount() {
    if (host?.isConnected) return;
    host = document.createElement('capas-bubble');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:flex;flex-direction:column;align-items:center;gap:12px;'
      + 'font:500 14px/1 Inter,system-ui,sans-serif;color:#fff;user-select:none;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${CSS}</style>
      <div class="bubble">
        <div class="cam">
          <p class="msg" hidden><span></span><button type="button" data-act="permission" hidden>Dar permiso</button></p>
        </div>
        <div class="tools">
          <button type="button" data-act="smaller" title="Más pequeña" aria-label="Hacer la cámara más pequeña">${icon('minus')}</button>
          <button type="button" data-act="bigger" title="Más grande" aria-label="Hacer la cámara más grande">${icon('plus')}</button>
          <button type="button" data-act="cam" title="Ocultar cámara" aria-label="Ocultar cámara">${icon('webcamOff')}</button>
        </div>
      </div>
      <div class="bar" role="toolbar" aria-label="Controles de grabación de Capas">
        <span class="dot"></span><span class="time">0:00</span>
        <button type="button" data-act="pause"></button>
        <button type="button" data-act="stop" class="stop" title="Terminar y guardar" aria-label="Terminar y guardar">${icon('stop')}</button>
        <button type="button" data-act="cam" class="cam-toggle"></button>
      </div>`;
    const $ = (sel) => root.querySelector(sel);
    ui = {
      bubble: $('.bubble'), cam: $('.cam'), bar: $('.bar'), time: $('.time'), pause: $('[data-act="pause"]'),
      camToggle: $('.cam-toggle'), msg: $('.msg'), msgText: $('.msg span'), permission: $('[data-act="permission"]'),
      frame: null, label: null,
    };
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onPointerDown);
    ui.bubble.addEventListener('wheel', onWheel, { passive: false });
    // Keep the page's own shortcuts and outside-click handlers from reacting to the bubble.
    for (const type of ['click', 'pointerdown', 'mousedown', 'wheel', 'keydown']) host.addEventListener(type, (e) => e.stopPropagation());
    document.documentElement.append(host);
  }

  function unmount() {
    clearInterval(timer);
    timer = 0;
    host?.remove();
    host = ui = null;
  }

  function render() {
    if (!alive() || !rec || document.visibilityState !== 'visible') { unmount(); return; }
    mount();
    const camOn = !!rec.camVisible;
    ui.bubble.hidden = !camOn;
    if (camOn && (!ui.frame || ui.label !== rec.camLabel)) showCamera();
    if (!camOn && ui.frame) { ui.frame.remove(); ui.frame = null; showCamError(null); }
    const paused = rec.status === 'paused';
    setBtn(ui.pause, paused ? 'play' : 'pause', paused ? 'Reanudar' : 'Pausar');
    ui.pause.disabled = rec.status !== 'recording' && !paused;
    ui.bar.classList.toggle('paused', paused);
    ui.bar.classList.toggle('saving', rec.status === 'saving');
    ui.camToggle.hidden = !rec.camera;
    setBtn(ui.camToggle, camOn ? 'webcamOff' : 'webcam', camOn ? 'Ocultar cámara' : 'Mostrar cámara');
    clearInterval(timer);
    timer = rec.status === 'recording' ? setInterval(tick, 500) : 0;
    tick();
    position();
  }

  function tick() {
    if (!ui || !rec) return;
    const ms = rec.elapsed + (rec.status === 'recording' ? Date.now() - rec.at : 0);
    ui.time.textContent = rec.status === 'saving' ? 'Guardando…' : fmt(ms);
  }

  function showCamera() {
    ui.frame?.remove();
    const frame = document.createElement('iframe');
    frame.setAttribute('allow', 'camera');
    frame.src = `${chrome.runtime.getURL('camera.html')}?label=${encodeURIComponent(rec.camLabel)}`;
    ui.cam.prepend(frame);
    ui.frame = frame;
    ui.label = rec.camLabel;
    showCamError(null);
  }

  function showCamError(code) {
    ui.msg.hidden = !code;
    ui.msgText.textContent = code ? camErrors[code] ?? camErrors.busy : '';
    ui.permission.hidden = code !== 'permission';
  }

  // Bottom-left anchoring keeps the bar in place when the camera is hidden or shown.
  function position() {
    host.style.setProperty('--size', `${place.size}px`);
    const w = host.offsetWidth;
    const h = host.offsetHeight;
    place.x = Math.round(Math.min(innerWidth - w - 8, Math.max(8, place.x)));
    place.b = Math.round(Math.min(innerHeight - h - 8, Math.max(8, place.b)));
    host.style.left = `${place.x}px`;
    host.style.bottom = `${place.b}px`;
  }

  function resize(delta) {
    const before = host.offsetWidth;
    place.size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, place.size + delta));
    host.style.setProperty('--size', `${place.size}px`);
    place.x -= (host.offsetWidth - before) / 2;
    position();
    saveSoon();
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'smaller') resize(-40);
    else if (act === 'bigger') resize(40);
    else if (act === 'permission') send({ type: 'permission' });
    else if (act) send({ type: 'cmd', cmd: act });
  }

  function onWheel(e) {
    e.preventDefault();
    resize(e.deltaY < 0 ? 16 : -16);
  }

  function onPointerDown(e) {
    if (e.button !== 0 || e.target.closest('button') || !e.target.closest('.cam, .bar')) return;
    e.preventDefault();
    const el = host;
    const parts = [ui.bubble, ui.bar];
    const start = { px: e.clientX, py: e.clientY, x: place.x, b: place.b };
    el.setPointerCapture(e.pointerId);
    parts.forEach((p) => p.classList.add('dragging'));
    const move = (ev) => {
      place.x = start.x + ev.clientX - start.px;
      place.b = start.b - (ev.clientY - start.py);
      if (host === el) position();
    };
    const end = () => {
      parts.forEach((p) => p.classList.remove('dragging'));
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      save();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  window.addEventListener('message', (e) => {
    if (!ui?.frame || e.source !== ui.frame.contentWindow || e.origin !== EXT_ORIGIN || e.data?.source !== 'capas-cam') return;
    showCamError(e.data.error);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(changes.rec || changes.bubble)) return;
    if (changes.rec) rec = changes.rec.newValue ?? null;
    if (changes.bubble) Object.assign(place, changes.bubble.newValue);
    render();
  });
  document.addEventListener('visibilitychange', render);
  window.addEventListener('resize', () => { if (host) position(); });

  chrome.storage.local.get(['rec', 'bubble']).then(({ rec: saved, bubble }) => {
    rec = saved ?? null;
    Object.assign(place, bubble);
    render();
  });
})();
