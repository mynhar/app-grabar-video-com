const allow = document.getElementById('allow');
const settings = document.getElementById('settings');
const status = document.getElementById('status');

const messages = {
  granted: 'Listo: la burbuja ya puede mostrar tu cámara. Puedes cerrar esta pestaña.',
  denied: 'Chrome tiene bloqueada la cámara para Capas. Actívala en la configuración y vuelve a esta pestaña.',
  dismissed: 'No se dio el permiso. Vuelve a intentarlo.',
  missing: 'No se encontró ninguna cámara.',
};

function show(state) {
  allow.hidden = state === 'granted';
  settings.hidden = state !== 'denied';
  status.textContent = messages[state] ?? '';
  status.classList.toggle('is-error', state !== 'granted');
}

allow.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    show('granted');
  } catch (err) {
    if (err.name !== 'NotAllowedError') { show('missing'); return; }
    const { state } = await navigator.permissions.query({ name: 'camera' });
    show(state === 'denied' ? 'denied' : 'dismissed');
  }
});

settings.addEventListener('click', () => {
  chrome.tabs.create({ url: `chrome://settings/content/siteDetails?site=${encodeURIComponent(location.origin)}` });
});

navigator.permissions.query({ name: 'camera' }).then((permission) => {
  if (permission.state !== 'prompt') show(permission.state);
  permission.onchange = () => show(permission.state);
});
