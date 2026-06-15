import { contextItems } from '../shared/registry';

// Install Context Menus
chrome.runtime.onInstalled.addListener(() => {
  const items = contextItems();
  
  if (items.length > 0) {
    chrome.contextMenus.create({
      id: 'seonology-toolkit-root',
      title: 'Seonology Toolkit',
      contexts: ['selection']
    });

    for (const item of items) {
      chrome.contextMenus.create({
        id: item.id,
        parentId: 'seonology-toolkit-root',
        title: item.title,
        contexts: ['selection']
      });
    }
  }
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const items = contextItems();
  const item = items.find(i => i.id === info.menuItemId);
  
  if (item && info.selectionText) {
    try {
      const result = item.run(info.selectionText);
      // 복사
      await copyToClipboard(result);
      // (선택) 탭에 메시지를 보내 토스트 띄우기 구현 가능
    } catch (e) {
      console.error('Transform failed:', e);
    }
  }
});

// Handle Keyboard Shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-newtab-toolkit') {
    chrome.tabs.create({ url: `chrome-extension://${chrome.runtime.id}/newtab.html` });
  } else if (command === 'format-json-clipboard') {
    // Requires reading clipboard, which needs DOM focus or offscreen document in MV3.
    // For simplicity without 'clipboardRead' or DOM:
    console.log('format-json-clipboard command triggered');
  }
});

// Utility to copy to clipboard in service worker using offscreen document or injecting script
async function copyToClipboard(text) {
  // Since clipboard API is restricted in service workers, we can inject a script to the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (textToCopy) => {
        navigator.clipboard.writeText(textToCopy)
          .then(() => console.log('Copied by Seonology Toolkit'))
          .catch(e => console.error('Copy failed', e));
      },
      args: [text]
    });
  }
}
