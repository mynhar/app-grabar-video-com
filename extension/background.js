// Relays between the Capas page (bridge.js) and the bubbles (bubble.js). The recording state lives in
// chrome.storage.local under `rec`, so every tab redraws its bubble from storage.onChanged.

const clear = () => chrome.storage.local.set({ rec: null, recTab: null });

async function sendCommand(cmd) {
  const { recTab } = await chrome.storage.local.get('recTab');
  if (recTab == null) return;
  // A missing receiver means the Capas tab is gone or reloaded: drop the stale bubble.
  chrome.tabs.sendMessage(recTab, { type: 'cmd', cmd }).catch(clear);
}

// State updates are applied one at a time so a quick "saving" → null pair can't land out of order.
let stateQueue = Promise.resolve();

async function applyState(state, tabId) {
  if (state) return chrome.storage.local.set({ rec: state, recTab: tabId });
  // Another localhost tab closing must not clear the state of the tab that is recording.
  const { recTab } = await chrome.storage.local.get('recTab');
  if (recTab === tabId) return clear();
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'state') {
    stateQueue = stateQueue.then(() => applyState(msg.state, sender.tab?.id)).catch(() => {});
  }
  if (msg.type === 'cmd') sendCommand(msg.cmd);
  if (msg.type === 'permission') chrome.tabs.create({ url: 'permission.html' });
});

chrome.action.onClicked.addListener(() => sendCommand('cam'));

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { recTab } = await chrome.storage.local.get('recTab');
  if (tabId === recTab) clear();
});

chrome.runtime.onStartup.addListener(clear);

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  clear();
  // Content scripts only reach pages loaded after install; add them to the tabs that are already open.
  for (const tab of await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })) {
    const files = /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(tab.url) ? ['bubble.js', 'bridge.js'] : ['bubble.js'];
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files }).catch(() => {});
  }
  if (reason === 'install') chrome.tabs.create({ url: 'permission.html' });
});
