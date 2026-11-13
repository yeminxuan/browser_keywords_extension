import type { CdpClicksPayload, CdpDragPayload, Settings, ShortcutGroup } from '../types';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function tabKeys(tabId: number): { groupsKey: string; settingsKey: string } {
  return { groupsKey: `ds:groups:${tabId}`, settingsKey: `ds:settings:${tabId}` };
}

type InitPayload = {
  groups?: ShortcutGroup[];
  settings?: Partial<Settings>;
};

async function loadTabStore(tabId: number): Promise<InitPayload> {
  const { groupsKey, settingsKey } = tabKeys(tabId);
  const data = (await chrome.storage.local.get([groupsKey, settingsKey])) as Record<string, unknown>;
  return {
    groups: Array.isArray(data[groupsKey]) ? (data[groupsKey] as ShortcutGroup[]) : undefined,
    settings: (data[settingsKey] as Partial<Settings> | undefined) ?? undefined,
  };
}

/** chrome.debugger 只接受 attach(target, version) 这一种签名，别传对象参数。 */
async function attachDebugger(tabId: number): Promise<chrome.debugger.Debuggee> {
  const target: chrome.debugger.Debuggee = { tabId };
  await chrome.debugger.attach(target, '1.3');
  return target;
}

async function runCdpDrag(tabId: number, payload: CdpDragPayload): Promise<void> {
  const target = await attachDebugger(tabId);

  const send = (params: Record<string, unknown>): Promise<object | undefined> =>
    chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', params);

  const { start, end, duration, hold, steps } = payload;
  const totalSteps = Math.max(1, Math.round(steps));
  const stepTime = duration / totalSteps;

  try {
    await send({ type: 'mouseMoved', x: start.x, y: start.y, button: 'none', buttons: 0, clickCount: 0 });
    await send({ type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 });

    await sleep(hold);

    for (let i = 1; i <= totalSteps; i += 1) {
      const eased = easeInOutCubic(i / totalSteps);
      const x = start.x + (end.x - start.x) * eased;
      const y = start.y + (end.y - start.y) * eased;
      await send({ type: 'mouseMoved', x, y, button: 'left', buttons: 1, clickCount: 0 });
      if (i < totalSteps) {
        await sleep(stepTime);
      }
    }

    await send({ type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1 });
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function runCdpClicks(tabId: number, payload: CdpClicksPayload): Promise<void> {
  const target = await attachDebugger(tabId);

  const send = (params: Record<string, unknown>): Promise<object | undefined> =>
    chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', params);

  const interval = Math.max(0, payload.interval);

  try {
    for (const point of payload.points) {
      const x = point.x;
      const y = point.y;
      await send({ type: 'mouseMoved', x, y, button: 'none', buttons: 0, clickCount: 0 });
      await send({ type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await send({ type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      if (interval > 0) {
        await sleep(interval);
      }
    }
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function togglePanel(tab: chrome.tabs.Tab): Promise<void> {
  if (typeof tab.id !== 'number') return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' });
  } catch {
    // 安装/刷新扩展前打开的页面没有 content script，补注入一次
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' });
    } catch {
      // 受限页面（chrome://、扩展商店等）无法注入，忽略
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  void togglePanel(tab);
});

function friendlyError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return `高兼容模式不可用（${text}）。请确认没有打开 DevTools 调试该页面后重试。`;
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const data = message as {
    type?: string;
    payload?: CdpDragPayload | CdpClicksPayload;
  } | null;

  if (data?.type === 'whoami') {
    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number') {
      sendResponse({ ok: false, error: '无法识别当前标签页' });
      return;
    }
    void loadTabStore(tabId)
      .then((store) => sendResponse({ ok: true, tabId, ...store }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (data?.type === 'capture-tab') {
    // 取色器用：截取发送方所在窗口的可见区域
    const windowId = sender.tab?.windowId;
    const capture =
      typeof windowId === 'number'
        ? chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
        : chrome.tabs.captureVisibleTab({ format: 'png' });
    void capture
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      );
    return true;
  }

  if (!data?.payload) return;

  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') {
    sendResponse({ ok: false, error: '找不到当前标签页' });
    return;
  }

  let task: Promise<void>;
  if (data.type === 'cdp-drag') {
    task = runCdpDrag(tabId, data.payload as CdpDragPayload);
  } else if (data.type === 'cdp-clicks') {
    task = runCdpClicks(tabId, data.payload as CdpClicksPayload);
  } else {
    return;
  }

  void task
    .then(() => sendResponse({ ok: true }))
    .catch((error: unknown) => sendResponse({ ok: false, error: friendlyError(error) }));

  return true;
});
