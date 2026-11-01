// Runs on the Capas page: tells the app the extension is installed, sends its recording state to the
// service worker and passes the bubble's commands back to the app.
(() => {
  if (window.__capasBridge) return;
  window.__capasBridge = true;

  const toPage = (msg) => window.postMessage({ source: 'capas-ext', ...msg }, location.origin);
  const toWorker = (msg) => {
    if (chrome.runtime?.id) chrome.runtime.sendMessage(msg).catch(() => {});
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'capas-app') return;
    if (e.data.type === 'ping') toPage({ type: 'hello' });
    if (e.data.type === 'state') toWorker({ type: 'state', state: e.data.state });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'cmd') toPage({ type: 'cmd', cmd: msg.cmd });
  });

  window.addEventListener('pagehide', () => toWorker({ type: 'state', state: null }));
  toPage({ type: 'hello' });
})();
