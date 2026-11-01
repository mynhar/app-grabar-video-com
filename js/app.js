import * as db from './db.js';
import { icon, logoMark } from './icons.js';
import {
  RecordingSession, canRecord, canRecordScreen, canDocPip,
  openCamera, openMic, stopStream, grabFrame, thumbFromBlob,
} from './recorder.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');
const AUTHOR = 'Harold M. Bonilla López';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------- Formatting ---------- */

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const dateFmt = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeStyle: 'short' });
const titleFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function fmtRelative(ts) {
  const s = (ts - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  return 'hace un momento';
}

function fmtDuration(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function fmtSize(bytes) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

const fmtViews = (n = 0) => `${n} ${n === 1 ? 'vista' : 'vistas'}`;
const modeLabel = { 'screen-camera': 'Pantalla y cámara', screen: 'Solo pantalla', camera: 'Solo cámara' };

function fileName(video) {
  const ext = video.mimeType?.includes('mp4') ? 'mp4' : 'webm';
  const base = video.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  return `${base || 'video'}.${ext}`;
}

/* ---------- Preferences ---------- */

const PREFS_KEY = 'capas.prefs';
const prefs = { mode: 'screen-camera', camId: '', micId: '', sysAudio: true, sort: 'new' };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch {}
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} };

/* ---------- Toasts, dialogs, menus ---------- */

function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 350);
  }, 3800);
}

function confirmDialog({ title, message, confirm = 'Eliminar' }) {
  const d = $('#confirm-dialog');
  $('h2', d).textContent = title;
  $('p', d).textContent = message;
  $('[value="ok"]', d).textContent = confirm;
  d.returnValue = '';
  d.showModal();
  return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }));
}

function renameDialog(current) {
  const d = $('#rename-dialog');
  const input = $('input', d);
  input.value = current;
  d.returnValue = '';
  d.showModal();
  input.select();
  return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok' ? input.value.trim() : null), { once: true }));
}

let menuEl = null;
function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}

function showMenu(anchor, items) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `menu-item${item.danger ? ' is-danger' : ''}`;
    b.setAttribute('role', 'menuitem');
    b.innerHTML = `${icon(item.icon)}<span>${esc(item.label)}</span>`;
    b.addEventListener('click', () => { closeMenu(); item.run(); });
    menu.append(b);
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8));
  let top = r.bottom + 6;
  if (top + menu.offsetHeight > innerHeight - 8) top = r.top - menu.offsetHeight - 6;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menuEl = menu;
  menu.querySelector('button').focus();
}

document.addEventListener('click', (e) => {
  if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-menu]')) closeMenu();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());
addEventListener('scroll', closeMenu, true);
addEventListener('resize', closeMenu);

/* ---------- Video actions ---------- */

async function copyLink(video) {
  const url = `${location.origin}${location.pathname}#/v/${video.id}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Enlace copiado. Funciona en este navegador; para enviarlo, descarga el video.');
  } catch {
    toast('No se pudo copiar el enlace.', 'error');
  }
}

function downloadVideo(video) {
  const url = URL.createObjectURL(video.blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName(video) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function renameVideo(video) {
  const title = await renameDialog(video.title);
  if (!title || title === video.title) return null;
  await db.updateVideo(video.id, { title });
  toast('Título actualizado');
  return title;
}

async function removeVideo(video) {
  const ok = await confirmDialog({
    title: '¿Eliminar este video?',
    message: `«${video.title}» se borrará de este navegador. Esta acción no se puede deshacer.`,
  });
  if (!ok) return false;
  await db.deleteVideo(video.id);
  toast('Video eliminado');
  return true;
}

/* ---------- Router ---------- */

let routeId = 0;
let cleanups = [];

async function route() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  closeMenu();
  const id = ++routeId;
  const match = location.hash.match(/^#\/v\/([\w-]+)$/);
  if (match) await renderViewer(match[1], id);
  else await renderLibrary(id);
  refreshSidebar();
  if (!R.session) restTitle = document.title;
}

async function refreshSidebar() {
  const count = await db.countVideos();
  $('#nav-count').textContent = count || '';
  const est = await navigator.storage?.estimate?.().catch(() => null);
  $('#storage').textContent = est ? `${fmtSize(est.usage)} usados en este navegador` : '';
}

/* ---------- Library ---------- */

const lib = { q: '' };
const recDot = '<span class="rec-dot-sm"></span>';

const emptyState = () => `
  <div class="empty">
    <div class="empty-art">${logoMark()}</div>
    <h2>Graba tu primer video</h2>
    <p>Captura tu pantalla, tu cámara o ambas, y guarda el video aquí para verlo, descargarlo o compartirlo.</p>
    <button class="btn btn-primary btn-lg" type="button" data-action="new-recording">${recDot}<span>Nuevo video</span></button>
  </div>`;

const cardHTML = (v) => `
  <article class="card" data-id="${esc(v.id)}">
    <a class="card-thumb" href="#/v/${esc(v.id)}" aria-label="Ver ${esc(v.title)}">
      ${v.thumbnail ? `<img src="${esc(v.thumbnail)}" alt="" loading="lazy">` : `<span class="thumb-fallback">${logoMark()}</span>`}
      <span class="play-hint"><span class="play-circle">${icon('play')}</span></span>
      <span class="duration">${fmtDuration(v.duration)}</span>
    </a>
    <div class="card-body">
      <div class="card-text">
        <a class="card-title" href="#/v/${esc(v.id)}">${esc(v.title)}</a>
        <p class="card-meta">${fmtRelative(v.createdAt)} · ${fmtViews(v.views)}</p>
      </div>
      <button class="icon-btn" type="button" data-menu aria-label="Opciones de ${esc(v.title)}">${icon('more')}</button>
    </div>
  </article>`;

const sorters = {
  new: (a, b) => b.createdAt - a.createdAt,
  old: (a, b) => a.createdAt - b.createdAt,
  title: (a, b) => a.title.localeCompare(b.title, 'es'),
  long: (a, b) => b.duration - a.duration,
};

async function renderLibrary(id) {
  const videos = await db.listVideos();
  if (id !== routeId) return;
  document.title = 'Mis videos · Capas';
  view.innerHTML = `
    <header class="topbar">
      <label class="search">${icon('search')}<input id="search" type="search" placeholder="Buscar en mis videos" aria-label="Buscar en mis videos" value="${esc(lib.q)}"></label>
      <button class="btn btn-primary" type="button" data-action="new-recording">${recDot}<span>Nuevo video</span></button>
    </header>
    <section class="content">
      <div class="page-head">
        <div><h1>Mis videos</h1><p class="page-sub" id="lib-count"></p></div>
        <label class="sort"><span>Ordenar por</span>
          <select id="sort">
            <option value="new">Más recientes</option>
            <option value="old">Más antiguos</option>
            <option value="title">Título (A-Z)</option>
            <option value="long">Más largos</option>
          </select>
        </label>
      </div>
      <div id="grid"></div>
    </section>`;
  const sort = $('#sort');
  sort.value = sorters[prefs.sort] ? prefs.sort : 'new';
  sort.addEventListener('change', () => { prefs.sort = sort.value; savePrefs(); drawGrid(videos); });
  $('#search').addEventListener('input', (e) => { lib.q = e.target.value; drawGrid(videos); });
  $('#grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-menu]');
    if (!btn) return;
    const video = videos.find((v) => v.id === btn.closest('.card').dataset.id);
    showMenu(btn, [
      { icon: 'edit', label: 'Cambiar título', run: async () => { const t = await renameVideo(video); if (t) { video.title = t; drawGrid(videos); } } },
      { icon: 'link', label: 'Copiar enlace', run: () => copyLink(video) },
      { icon: 'download', label: 'Descargar', run: () => downloadVideo(video) },
      { icon: 'trash', label: 'Eliminar', danger: true, run: async () => {
        if (!(await removeVideo(video))) return;
        videos.splice(videos.indexOf(video), 1);
        drawGrid(videos);
        refreshSidebar();
      } },
    ]);
  });
  drawGrid(videos);
}

function drawGrid(all) {
  const grid = $('#grid');
  if (!grid) return;
  const q = lib.q.trim().toLocaleLowerCase('es');
  const list = (q ? all.filter((v) => v.title.toLocaleLowerCase('es').includes(q)) : [...all]).sort(sorters[prefs.sort] ?? sorters.new);
  const noun = (n) => `${n} ${n === 1 ? 'video' : 'videos'}`;
  $('#lib-count').textContent = !all.length ? '' : q ? `${list.length} de ${noun(all.length)}` : noun(all.length);
  if (!all.length) {
    grid.className = '';
    grid.innerHTML = emptyState();
  } else if (!list.length) {
    grid.className = '';
    grid.innerHTML = `<div class="empty empty-sm"><h2>Sin resultados</h2><p>Ningún video coincide con «${esc(lib.q.trim())}».</p></div>`;
  } else {
    grid.className = 'grid';
    grid.innerHTML = list.map(cardHTML).join('');
  }
}

/* ---------- Viewer ---------- */

async function renderViewer(videoId, id) {
  const video = await db.getVideo(videoId);
  if (id !== routeId) return;
  const back = `<a class="back" href="#/">${icon('arrowLeft')}<span>Mis videos</span></a>`;
  if (!video) {
    document.title = 'Video no encontrado · Capas';
    view.innerHTML = `
      <header class="topbar">${back}</header>
      <section class="content"><div class="empty">
        <div class="empty-art">${logoMark()}</div>
        <h2>Video no encontrado</h2>
        <p>Puede que se haya eliminado o que se grabara en otro navegador.</p>
        <a class="btn btn-primary" href="#/">Ir a Mis videos</a>
      </div></section>`;
    return;
  }

  document.title = `${video.title} · Capas`;
  const url = URL.createObjectURL(video.blob);
  cleanups.push(() => URL.revokeObjectURL(url));
  const res = video.width && video.height ? `${video.width} × ${video.height}` : '—';

  view.innerHTML = `
    <header class="topbar">
      ${back}
      <div class="topbar-actions">
        <button class="btn btn-secondary" type="button" data-act="copy">${icon('link')}<span>Copiar enlace</span></button>
        <button class="btn btn-secondary" type="button" data-act="download">${icon('download')}<span>Descargar</span></button>
        <button class="icon-btn" type="button" data-act="more" data-menu aria-label="Más opciones">${icon('more')}</button>
      </div>
    </header>
    <section class="content viewer">
      <div class="viewer-head">
        <input class="title-input" id="title" value="${esc(video.title)}" maxlength="120" aria-label="Título del video">
        <div class="viewer-meta">
          <span class="avatar">${logoMark()}</span>
          <span><strong>${AUTHOR}</strong><span class="muted">${dateFmt.format(video.createdAt)} · <span id="views">${fmtViews(video.views)}</span></span></span>
        </div>
      </div>
      <div class="player"><video controls playsinline preload="metadata" src="${url}"></video></div>
      <div class="player-row">
        <div class="speed" role="group" aria-label="Velocidad de reproducción">
          <span>Velocidad</span>
          ${[0.5, 1, 1.25, 1.5, 2].map((r) => `<button type="button" data-rate="${r}" aria-pressed="${r === 1}">${r}×</button>`).join('')}
        </div>
      </div>
      <dl class="details">
        <div><dt>Duración</dt><dd>${fmtDuration(video.duration)}</dd></div>
        <div><dt>Tamaño</dt><dd>${fmtSize(video.size ?? video.blob.size)}</dd></div>
        <div><dt>Resolución</dt><dd id="res">${res}</dd></div>
        <div><dt>Formato</dt><dd>${video.mimeType?.includes('mp4') ? 'MP4' : 'WebM'}</dd></div>
        <div><dt>Contenido</dt><dd>${modeLabel[video.mode] ?? '—'}</dd></div>
      </dl>
    </section>`;

  const player = $('.player video');
  // MediaRecorder WebM files have no duration header; seeking far forces the browser to compute it.
  player.addEventListener('loadedmetadata', () => {
    if (!video.width && player.videoWidth) $('#res').textContent = `${player.videoWidth} × ${player.videoHeight}`;
    if (player.duration !== Infinity && !Number.isNaN(player.duration)) return;
    player.currentTime = 1e101;
    player.addEventListener('timeupdate', () => (player.currentTime = 0), { once: true });
  }, { once: true });
  player.addEventListener('play', () => {
    video.views = (video.views || 0) + 1;
    db.updateVideo(video.id, { views: video.views });
    $('#views').textContent = fmtViews(video.views);
  }, { once: true });

  const titleInput = $('#title');
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') titleInput.blur();
    if (e.key === 'Escape') { titleInput.value = video.title; titleInput.blur(); }
  });
  titleInput.addEventListener('blur', async () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.value = video.title; return; }
    if (title === video.title) return;
    video.title = title;
    await db.updateVideo(video.id, { title });
    document.title = `${title} · Capas`;
    toast('Título actualizado');
  });

  view.addEventListener('click', viewerClick);
  cleanups.push(() => view.removeEventListener('click', viewerClick));

  function viewerClick(e) {
    const rate = e.target.closest('[data-rate]');
    if (rate) {
      player.playbackRate = Number(rate.dataset.rate);
      $$('[data-rate]').forEach((b) => b.setAttribute('aria-pressed', String(b === rate)));
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'copy') copyLink(video);
    if (act === 'download') downloadVideo(video);
    if (act === 'more') {
      showMenu(e.target.closest('[data-act]'), [
        { icon: 'edit', label: 'Cambiar título', run: () => { titleInput.focus(); titleInput.select(); } },
        { icon: 'trash', label: 'Eliminar', danger: true, run: async () => { if (await removeVideo(video)) location.hash = '#/'; } },
      ]);
    }
  }
}

/* ---------- Recorder setup dialog ---------- */

const recDialog = $('#recorder');
const pipVideo = $('#pip-source');
const R = { cam: null, mic: null, camError: null, micError: null, meter: null, session: null, floating: null, timer: 0, thumb: null, size: null, starting: false, finishing: false, camHidden: false, pipSize: null };
let restTitle = document.title;

async function openRecorder() {
  if (R.session) return;
  if (!canRecord) { toast('Este navegador no permite grabar video.', 'error'); return; }
  if (!canRecordScreen) prefs.mode = 'camera';
  $$('input[name="mode"]', recDialog).forEach((input) => {
    input.checked = input.value === prefs.mode;
    input.disabled = !canRecordScreen && input.value !== 'camera';
  });
  $('#sys-audio').checked = prefs.sysAudio;
  R.starting = false;
  recDialog.showModal();
  updatePreview();
  await syncDevices();
}

recDialog.addEventListener('close', () => {
  if (!R.starting) releasePreview();
});

recDialog.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.name === 'mode') prefs.mode = t.value;
  else if (t.id === 'cam-select') prefs.camId = t.value;
  else if (t.id === 'mic-select') prefs.micId = t.value;
  else if (t.id === 'sys-audio') prefs.sysAudio = t.checked;
  savePrefs();
  await syncDevices();
});

navigator.mediaDevices?.addEventListener?.('devicechange', () => recDialog.open && fillSelects());

function releasePreview() {
  stopMeter();
  stopStream(R.cam);
  stopStream(R.mic);
  R.cam = R.mic = null;
  $('#rec-preview video').srcObject = null;
  pipVideo.srcObject = null;
}

async function syncDevices() {
  const needCam = prefs.mode !== 'screen' && prefs.camId !== 'none';
  const needMic = prefs.micId !== 'none';
  await Promise.all([
    needCam ? ensureStream('cam') : dropStream('cam'),
    needMic ? ensureStream('mic') : dropStream('mic'),
  ]);
  if (!recDialog.open) return;
  await fillSelects();
  updatePreview();
}

function isLive(stream, deviceId) {
  const track = stream?.getTracks()[0];
  return track?.readyState === 'live' && (!deviceId || track.getSettings().deviceId === deviceId);
}

async function ensureStream(kind) {
  const deviceId = kind === 'cam' ? prefs.camId : prefs.micId;
  if (isLive(R[kind], deviceId)) return;
  stopStream(R[kind]);
  R[kind] = null;
  R[`${kind}Error`] = null;
  let stream = null;
  try {
    stream = await (kind === 'cam' ? openCamera(deviceId) : openMic(deviceId));
  } catch (err) {
    R[`${kind}Error`] = err;
  }
  if (stream && !recDialog.open) { stopStream(stream); return; }
  R[kind] = stream;
  if (kind === 'mic') startMeter(stream);
}

function dropStream(kind) {
  stopStream(R[kind]);
  R[kind] = null;
  R[`${kind}Error`] = null;
  if (kind === 'mic') stopMeter();
}

async function fillSelects() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  fillSelect($('#cam-select'), devices.filter((d) => d.kind === 'videoinput'), 'Cámara', 'Sin cámara', R.cam, prefs.camId);
  fillSelect($('#mic-select'), devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications'), 'Micrófono', 'Sin micrófono', R.mic, prefs.micId);
}

function fillSelect(select, devices, noun, noneLabel, stream, pref) {
  const usable = devices.filter((d) => d.deviceId);
  select.innerHTML = usable.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `${noun} ${i + 1}`)}</option>`).join('')
    + `<option value="none">${noneLabel}</option>`;
  const current = stream?.getTracks()[0]?.getSettings().deviceId;
  select.value = pref === 'none' || !usable.length ? 'none' : current || pref || usable[0].deviceId;
  if (!select.value) select.value = 'none';
}

function permissionMsg(err, what) {
  if (err.name === 'NotAllowedError') return `No hay permiso para usar ${what}; actívalo en la configuración del sitio.`;
  if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return `No se encontró ${what}.`;
  return `No se pudo abrir ${what} (puede que otra aplicación la esté usando).`;
}

function updatePreview() {
  const mode = prefs.mode;
  const box = $('#rec-preview');
  const video = $('video', box);
  box.dataset.mode = mode;
  box.classList.toggle('has-cam', !!R.cam);
  if (video.srcObject !== R.cam) video.srcObject = R.cam;
  if (pipVideo.srcObject !== R.cam) pipVideo.srcObject = R.cam;
  $('#cam-field').hidden = mode === 'screen';
  $('#sys-field').hidden = mode === 'camera';
  $('#preview-text').textContent = mode === 'camera'
    ? (R.cam ? '' : 'La cámara está apagada')
    : 'Al empezar se seleccionará la pantalla completa. También puedes elegir una ventana o una pestaña.';

  const hints = [];
  if (!canRecordScreen) hints.push('Este navegador no permite grabar la pantalla; puedes grabar con la cámara.');
  if (mode !== 'screen' && R.camError) hints.push(permissionMsg(R.camError, 'la cámara'));
  if (R.micError) hints.push(permissionMsg(R.micError, 'el micrófono'));
  else if (prefs.micId === 'none' && (mode === 'camera' || !prefs.sysAudio)) hints.push('El video se grabará sin sonido.');
  $('#rec-hint').textContent = hints.join(' ');
  $('#start-rec').disabled = mode === 'camera' && !R.cam;
}

function startMeter(stream) {
  stopMeter();
  if (!stream) return;
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  const bar = $('#mic-meter span');
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
    bar.style.transform = `scaleX(${Math.min(1, peak / 48)})`;
    raf = requestAnimationFrame(tick);
  };
  tick();
  R.meter = () => { cancelAnimationFrame(raf); ctx.close(); bar.style.transform = 'scaleX(0)'; };
}

function stopMeter() {
  R.meter?.();
  R.meter = null;
}

/* ---------- Recording ---------- */

const PIP_CSS = `
*{box-sizing:border-box;margin:0}html,body{height:100%}
body{position:relative;display:grid;place-items:center;background:#17313F;color:#fff;font:500 14px/1 Inter,system-ui,sans-serif;overflow:hidden;user-select:none}
.cam{position:absolute;inset:0;display:grid;place-items:center}
.cam video{width:calc(min(100vw,100vh) - 10px);aspect-ratio:1;object-fit:cover;border-radius:50%;transform:scaleX(-1);box-shadow:0 0 0 3px #3EC5B5;background:#0E222D}
.bar{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:5px 5px 5px 12px;border-radius:999px;background:rgba(14,34,45,.92);box-shadow:0 6px 18px rgba(0,0,0,.35);white-space:nowrap}
.size{position:absolute;top:8px;right:8px;display:flex;gap:4px}
.bar,.size{opacity:0;transition:opacity .15s}
body:hover .bar,body:hover .size,body:focus-within .bar,body:focus-within .size,body.no-cam .bar{opacity:1}
body.no-cam .cam,body.no-cam .size{display:none}
body.no-cam .bar{position:static;transform:none;background:none;box-shadow:none}
.dot{width:9px;height:9px;border-radius:50%;background:#E5484D;animation:p 1.4s ease-in-out infinite}
.paused .dot{animation:none;background:#8FB0C0}
@keyframes p{50%{opacity:.35}}
.time{min-width:38px;font-size:14px;font-variant-numeric:tabular-nums}
button{all:unset;cursor:pointer;width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.12);color:#fff}
.size button{background:rgba(14,34,45,.85)}
button:hover{background:rgba(255,255,255,.24)}button:focus-visible{outline:2px solid #3EC5B5;outline-offset:2px}
button.stop{background:#E5484D}button.stop:hover{background:#CF3B40}
svg{width:16px;height:16px}
.count{position:fixed;inset:0;display:grid;place-items:center;background:rgba(23,49,63,.85);color:#3EC5B5;font:700 72px/1 "Space Grotesk",system-ui,sans-serif}
.count[hidden]{display:none}`;

const PIP_CAM = { width: 280, height: 280 };
const PIP_BAR = { width: 240, height: 60 };

function openFloating(withCam) {
  if (canDocPip) {
    return documentPictureInPicture.requestWindow(withCam ? PIP_CAM : PIP_BAR).then((win) => ({ kind: 'doc', win })).catch(() => null);
  }
  if (withCam && document.pictureInPictureEnabled && pipVideo.readyState >= 1) {
    return pipVideo.requestPictureInPicture().then(() => ({ kind: 'video' })).catch(() => null);
  }
  return Promise.resolve(null);
}

function closeFloating(floating) {
  if (floating?.kind === 'doc') floating.win.close();
  if (floating?.kind === 'video' && document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
}

const floatingDoc = () => (R.floating?.kind === 'doc' ? R.floating.win.document : null);

async function floatControls(manual) {
  const s = R.session;
  if (!s || R.floating || R.finishing) return;
  const floating = await openFloating(!!s.camera && !R.camHidden);
  if (R.session !== s) { closeFloating(floating); return; }
  if (!floating) {
    if (manual) toast('El navegador no permitió abrir la ventana flotante.', 'error');
    return;
  }
  attachFloating(floating);
  showRecordingUI();
}

// Chrome 120+ calls this handler when the user switches tabs while the page captures camera or mic,
// granting the activation requestWindow() needs; it closes that window itself when the tab is visible again.
function setAutoFloating(on) {
  try { navigator.mediaSession?.setActionHandler('enterpictureinpicture', on ? () => floatControls(false) : null); } catch {}
}

function attachFloating(floating) {
  R.floating = floating;
  if (!floating) return;
  const onGone = () => {
    if (R.floating !== floating) return;
    R.floating = null;
    if (R.session) showRecordingUI();
  };
  if (floating.kind === 'video') {
    pipVideo.addEventListener('leavepictureinpicture', onGone, { once: true });
    return;
  }
  const doc = floating.win.document;
  const camera = R.session.camera;
  doc.head.innerHTML = `<meta charset="utf-8"><title>Grabando · Capas</title><style>${PIP_CSS}</style>`;
  doc.body.innerHTML = `
    ${camera ? `<div class="cam"><video autoplay muted playsinline></video></div>
    <div class="size">
      <button type="button" data-act="smaller" title="Más pequeña" aria-label="Hacer la cámara más pequeña">${icon('minus')}</button>
      <button type="button" data-act="bigger" title="Más grande" aria-label="Hacer la cámara más grande">${icon('plus')}</button>
    </div>` : ''}
    <div class="bar">
      <span class="dot"></span><span class="time">0:00</span>
      <button type="button" data-act="pause" title="Pausar" aria-label="Pausar">${icon('pause')}</button>
      <button type="button" data-act="stop" class="stop" title="Terminar y guardar" aria-label="Terminar y guardar">${icon('stop')}</button>
      ${camera ? '<button type="button" data-act="cam"></button>' : ''}
    </div>
    <div class="count" hidden></div>`;
  const v = doc.querySelector('video');
  if (v) { v.srcObject = camera; v.play().catch(() => {}); }
  doc.body.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'pause') togglePause();
    if (act === 'stop') finishRecording();
    if (act === 'cam') toggleCamera();
    if (act === 'smaller') resizeFloating(-40);
    if (act === 'bigger') resizeFloating(40);
  });
  floating.win.addEventListener('pagehide', onGone);
  updateRecUI();
}

async function startRecording() {
  const mode = prefs.mode;
  if (mode === 'camera' && !R.cam) return;
  // Everything below that needs user activation is started synchronously, before the first await.
  const audioCtx = new AudioContext();
  audioCtx.resume();
  let displayPromise = null;
  if (mode !== 'camera') {
    displayPromise = navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor', frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: prefs.sysAudio,
      monitorTypeSurfaces: 'include',
      selfBrowserSurface: 'include',
      surfaceSwitching: 'include',
      systemAudio: prefs.sysAudio ? 'include' : 'exclude',
    });
  }
  // With a camera, start with the round in-page bubble; it floats when the user leaves the tab.
  const floatingPromise = mode !== 'camera' && !R.cam ? openFloating(false) : Promise.resolve(null);

  let display = null;
  try {
    display = await displayPromise;
  } catch (err) {
    audioCtx.close();
    closeFloating(await floatingPromise);
    toast(err.name === 'NotAllowedError' ? 'No se compartió ninguna pantalla.' : 'No se pudo capturar la pantalla.', 'error');
    return;
  }

  R.starting = true;
  stopMeter();
  recDialog.close();
  if (mode === 'screen') { stopStream(R.cam); R.cam = null; }
  const session = new RecordingSession({ mode, display, camera: R.cam, mic: R.mic, audioCtx });
  pipVideo.srcObject = session.camera;
  R.cam = R.mic = null;
  R.session = session;
  R.thumb = null;
  R.finishing = false;
  session.addEventListener('ended', () => (session.state === 'idle' ? cancelRecording() : finishRecording()));
  if (mode !== 'camera') setAutoFloating(true);

  attachFloating(await floatingPromise);
  if (R.session !== session) return;
  showRecordingUI();

  if (!(await countdown(3, session))) return;
  try {
    session.start();
  } catch {
    session.cancel();
    teardownRecordingUI();
    toast('El navegador no pudo iniciar la grabación.', 'error');
    return;
  }
  const track = session.stream.getVideoTracks()[0];
  R.size = track.getSettings();
  grabFrame(track).then((thumb) => { if (R.session === session) R.thumb = thumb; }).catch(() => {});
  R.timer = setInterval(tick, 500);
  updateRecUI();
}

async function countdown(seconds, session) {
  const overlay = $('#countdown');
  overlay.hidden = false;
  for (let i = seconds; i > 0 && R.session === session; i--) {
    $('span', overlay).textContent = i;
    setFloatingCount(i);
    await new Promise((r) => setTimeout(r, 1000));
  }
  overlay.hidden = true;
  setFloatingCount(null);
  return R.session === session;
}

function setFloatingCount(n) {
  const el = floatingDoc()?.querySelector('.count');
  if (!el) return;
  el.hidden = n == null;
  el.textContent = n ?? '';
}

function showRecordingUI() {
  const s = R.session;
  const cam = $('#rec-camera');
  const camOn = !!s.camera && !R.camHidden;
  const inPageCam = s.mode === 'camera' || (camOn && !R.floating);
  cam.hidden = !inPageCam;
  cam.className = `rec-camera ${s.mode === 'camera' ? 'is-stage' : 'is-bubble'}`;
  $('video', cam).srcObject = inPageCam ? s.camera : null;
  if (inPageCam && s.mode !== 'camera') placeBubble();
  const canFloat = s.mode !== 'camera' && (canDocPip || (camOn && document.pictureInPictureEnabled));
  $('#bubble-btn').hidden = !canFloat || !!R.floating;
  $('#cam-btn').hidden = !(s.mode === 'screen-camera' && s.camera);
  $('#rec-bar').hidden = false;
  updateRecUI();
}

function toggleCamera() {
  const s = R.session;
  if (!s?.camera || s.mode !== 'screen-camera') return;
  R.camHidden = !R.camHidden;
  const f = R.floating;
  if (f?.kind === 'doc') {
    const win = f.win;
    const frameW = win.outerWidth - win.innerWidth;
    const frameH = win.outerHeight - win.innerHeight;
    if (R.camHidden) {
      R.pipSize = [win.outerWidth, win.outerHeight];
      resizeWindow(win, PIP_BAR.width + frameW, PIP_BAR.height + frameH);
    } else {
      resizeWindow(win, ...(R.pipSize ?? [PIP_CAM.width + frameW, PIP_CAM.height + frameH]));
    }
  } else if (f?.kind === 'video' && R.camHidden) {
    closeFloating(f);
  }
  showRecordingUI();
}

function resizeWindow(win, width, height) {
  try { win.resizeTo(Math.round(width), Math.round(height)); } catch {}
}

function resizeFloating(delta) {
  const win = R.floating?.kind === 'doc' && R.floating.win;
  if (!win || R.camHidden) return;
  const frameW = win.outerWidth - win.innerWidth;
  const frameH = win.outerHeight - win.innerHeight;
  const side = Math.min(screen.availHeight - frameH, Math.max(200, Math.max(win.innerWidth, win.innerHeight) + delta));
  resizeWindow(win, side + frameW, side + frameH);
}

/* In-page camera bubble: shown when there is no floating window. Drag to move, wheel or +/- to resize. */
const bubble = { size: prefs.bubbleSize || 200, x: null, y: null };
const camEl = $('#rec-camera');

function placeBubble() {
  const max = Math.max(96, Math.min(480, innerWidth - 32, innerHeight - 32));
  bubble.size = Math.round(Math.min(max, Math.max(96, bubble.size)));
  if (bubble.x == null) {
    bubble.x = 24;
    bubble.y = innerHeight - bubble.size - 24;
  }
  bubble.x = Math.round(Math.min(innerWidth - bubble.size - 8, Math.max(8, bubble.x)));
  bubble.y = Math.round(Math.min(innerHeight - bubble.size - 8, Math.max(8, bubble.y)));
  camEl.style.setProperty('--bs', `${bubble.size}px`);
  camEl.style.setProperty('--bx', `${bubble.x}px`);
  camEl.style.setProperty('--by', `${bubble.y}px`);
}

function resizeBubble(delta) {
  const before = bubble.size;
  bubble.size += delta;
  placeBubble();
  const grown = bubble.size - before;
  bubble.x -= grown / 2;
  bubble.y -= grown / 2;
  placeBubble();
  prefs.bubbleSize = bubble.size;
  savePrefs();
}

camEl.addEventListener('pointerdown', (e) => {
  if (!camEl.classList.contains('is-bubble') || e.button !== 0 || e.target.closest('button')) return;
  const start = { px: e.clientX, py: e.clientY, x: bubble.x, y: bubble.y };
  camEl.setPointerCapture(e.pointerId);
  camEl.classList.add('is-dragging');
  const move = (ev) => {
    bubble.x = start.x + ev.clientX - start.px;
    bubble.y = start.y + ev.clientY - start.py;
    placeBubble();
  };
  const end = () => {
    camEl.classList.remove('is-dragging');
    camEl.removeEventListener('pointermove', move);
    camEl.removeEventListener('pointerup', end);
    camEl.removeEventListener('pointercancel', end);
  };
  camEl.addEventListener('pointermove', move);
  camEl.addEventListener('pointerup', end);
  camEl.addEventListener('pointercancel', end);
});

camEl.addEventListener('wheel', (e) => {
  if (!camEl.classList.contains('is-bubble')) return;
  e.preventDefault();
  resizeBubble(e.deltaY < 0 ? 16 : -16);
}, { passive: false });

camEl.addEventListener('click', (e) => {
  const act = e.target.closest('[data-bubble]')?.dataset.bubble;
  if (act === 'smaller') resizeBubble(-40);
  if (act === 'bigger') resizeBubble(40);
  if (act === 'hide') toggleCamera();
});

addEventListener('resize', () => {
  if (!camEl.hidden && camEl.classList.contains('is-bubble')) placeBubble();
});

function tick() {
  const s = R.session;
  if (!s || R.finishing) return;
  const time = fmtDuration(s.time);
  $('#rec-time').textContent = time;
  const t = floatingDoc()?.querySelector('.time');
  if (t) t.textContent = time;
  document.title = `${s.state === 'paused' ? '❚❚' : '●'} ${time} · Grabando`;
}

function updateRecUI() {
  const s = R.session;
  if (!s) return;
  const paused = s.state === 'paused';
  const label = paused ? 'Reanudar' : 'Pausar';
  $('#rec-bar').classList.toggle('is-paused', paused);
  const pauseBtn = $('#pause-btn');
  pauseBtn.innerHTML = icon(paused ? 'play' : 'pause');
  pauseBtn.title = label;
  pauseBtn.setAttribute('aria-label', label);
  const camLabel = R.camHidden ? 'Mostrar cámara' : 'Ocultar cámara';
  const camIcon = icon(R.camHidden ? 'webcam' : 'webcamOff');
  const setBtn = (b, html, text) => { if (b) { b.innerHTML = html; b.title = text; b.setAttribute('aria-label', text); } };
  setBtn($('#cam-btn'), camIcon, camLabel);
  const doc = floatingDoc();
  if (doc) {
    doc.body.classList.toggle('paused', paused);
    doc.body.classList.toggle('no-cam', !s.camera || R.camHidden);
    setBtn(doc.querySelector('[data-act="pause"]'), icon(paused ? 'play' : 'pause'), label);
    setBtn(doc.querySelector('[data-act="cam"]'), camIcon, camLabel);
  }
  tick();
}

function togglePause() {
  const s = R.session;
  if (!s || R.finishing) return;
  if (s.state === 'recording') s.pause();
  else if (s.state === 'paused') s.resume();
  updateRecUI();
}

async function finishRecording() {
  const s = R.session;
  if (!s || R.finishing) return;
  if (s.state === 'idle') { cancelRecording(); return; }
  R.finishing = true;
  $('#rec-bar').classList.add('is-saving');
  $('#rec-time').textContent = 'Guardando…';
  const { blob, duration } = await s.stop();
  const { thumb, size } = R;
  teardownRecordingUI();
  if (!blob.size) { toast('La grabación quedó vacía.', 'error'); return; }

  const video = {
    id: crypto.randomUUID(),
    title: `Grabación del ${titleFmt.format(new Date())}`,
    blob,
    mimeType: blob.type || 'video/webm',
    size: blob.size,
    duration,
    thumbnail: thumb ?? (await thumbFromBlob(blob)),
    width: size?.width,
    height: size?.height,
    mode: s.mode,
    createdAt: Date.now(),
    views: 0,
  };
  try {
    await db.saveVideo(video);
  } catch {
    toast('No hay espacio para guardar el video; se descargará.', 'error');
    downloadVideo(video);
    return;
  }
  navigator.storage?.persist?.().catch(() => {});
  window.focus();
  location.hash = `#/v/${video.id}`;
  toast('Video guardado');
}

async function cancelRecording(ask = false) {
  const s = R.session;
  if (!s || R.finishing) return;
  if (ask) {
    const wasRecording = s.state === 'recording';
    if (wasRecording) { s.pause(); updateRecUI(); }
    const ok = await confirmDialog({ title: '¿Descartar la grabación?', message: 'Se perderá todo lo que llevas grabado.', confirm: 'Descartar' });
    if (R.session !== s) return;
    if (!ok) {
      if (wasRecording) { s.resume(); updateRecUI(); }
      return;
    }
  }
  s.cancel();
  teardownRecordingUI();
  toast(ask ? 'Grabación descartada' : 'Grabación cancelada');
}

function teardownRecordingUI() {
  clearInterval(R.timer);
  setAutoFloating(false);
  const floating = R.floating;
  R.floating = null;
  closeFloating(floating);
  Object.assign(R, { session: null, starting: false, finishing: false, thumb: null, size: null, camHidden: false, pipSize: null });
  const bar = $('#rec-bar');
  bar.hidden = true;
  bar.classList.remove('is-paused', 'is-saving');
  $('#countdown').hidden = true;
  const cam = $('#rec-camera');
  cam.hidden = true;
  $('video', cam).srcObject = null;
  pipVideo.srcObject = null;
  document.title = restTitle;
}

addEventListener('beforeunload', (e) => {
  if (R.session) e.preventDefault();
});

/* ---------- Boot ---------- */

$$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="new-recording"]')) openRecorder();
  const closer = e.target.closest('[data-close]');
  if (closer) closer.closest('dialog').close();
});

$('#start-rec').addEventListener('click', startRecording);
$('#pause-btn').addEventListener('click', togglePause);
$('#stop-btn').addEventListener('click', finishRecording);
$('#discard-btn').addEventListener('click', () => cancelRecording(true));
$('#cam-btn').addEventListener('click', toggleCamera);
$('#bubble-btn').addEventListener('click', () => floatControls(true));

addEventListener('hashchange', route);
route();
