// Seonology Clock Page ↔ Chrome Extension bridge
// Listens for tab activation requests from the web page and relays to background service worker

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  if (event.data?.type === 'seonology-activate-tab') {
    chrome.runtime.sendMessage({
      type: 'activateTab',
      tabId: event.data.tabId,
      windowId: event.data.windowId,
    });
  }
});
