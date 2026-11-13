import {
  DEFAULT_SETTINGS,
  type CdpClicksPayload,
  type CdpDragPayload,
  type Point,
  type Rect,
  type Settings,
  type ShortcutGroup,
  type ShortcutType,
  type Store,
} from '../types';
import { simulateClick, simulateDrag, sleep } from './drag';
import { panelStyles } from './styles';
import { Magnifier } from './magnifier';
import { ColorPicker } from './color-picker';

const HOST_ID = 'drag-shortcut-root';
const PANEL_WIDTH = 344;

const LIMITS = {
  duration: [0, 60000],
  holdAfterPress: [0, 10000],
  steps: [1, 500],
  areaStep: [1, 500],
  clickInterval: [0, 5000],
  magnifierZoom: [1.2, 6],
  pickerZoom: [2, 24],
} as const;

const TAB_LABELS: Record<ShortcutType, string> = {
  drag: '拖拽点击',
  area: '区域点击',
  point: '定点点击',
  loupe: '放大镜',
  picker: '取色',
};

const EMPTY_TEXT: Record<ShortcutType, string> = {
  drag: '还没有拖拽快捷键，点击上方按钮新建一组',
  area: '还没有区域点击，点击上方按钮框选区域',
  point: '还没有定点点击，点击上方按钮拾取位置',
  loupe: '还没有放大镜快捷键，录一个按键即可随时开关放大镜',
  picker: '还没有取色快捷键，录一个按键即可随时拾取鼠标位置的颜色',
};

interface GroupDraft {
  id: string;
  type: ShortcutType;
  key: string;
  enabled: boolean;
  duration: number | null;
  dragFromCursor: boolean;
  start: Point | null;
  end: Point | null;
  point: Point | null;
  area: Rect | null;
}

interface Wizard {
  mode: 'record-key' | 'pick' | 'pick-point' | 'draw-area';
  stage: 'start' | 'end';
  draft: GroupDraft;
}

function escapeHtml(value: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (char) => map[char] ?? char);
}

function normalizeKey(event: KeyboardEvent): string | null {
  if (event.key.length !== 1 || /\s/.test(event.key)) return null;
  return event.key.toLowerCase();
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}

function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  let className = '';
  if (typeof element.className === 'string') {
    const parts = element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
    className = parts.length ? `.${parts.join('.')}` : '';
  }
  return `${tag}${id}${className}`.slice(0, 40);
}

function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.round(Math.min(a.x, b.x)),
    y: Math.round(Math.min(a.y, b.y)),
    width: Math.round(Math.abs(a.x - b.x)),
    height: Math.round(Math.abs(a.y - b.y)),
  };
}

function countAreaPoints(rect: Rect, step: number): number {
  const safeStep = Math.max(1, Math.round(step));
  const cols = Math.floor(rect.width / safeStep) + 1;
  const rows = Math.floor(rect.height / safeStep) + 1;
  return cols * rows;
}

class DragShortcutApp {
  private readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private readonly panel: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly highlight: HTMLDivElement;
  private readonly tip: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;

  private store: Store = { groups: [], settings: { ...DEFAULT_SETTINGS } };
  private wizard: Wizard | null = null;
  private panelOpen = false;
  private picking = false;
  private running = false;
  private dragState: { dx: number; dy: number } | null = null;
  private drawAnchor: Point | null = null;
  private toastTimer: number | undefined;
  private lastMouse: Point | null = null;
  private tabId: number | null = null;
  private magnifier: Magnifier | null = null;
  private picker: ColorPicker | null = null;

  constructor() {
    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    this.host.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';

    this.root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = panelStyles;
    this.root.appendChild(style);

    this.overlay = document.createElement('div');
    this.overlay.className = 'ds-overlay';

    this.highlight = document.createElement('div');
    this.highlight.className = 'ds-highlight';

    this.tip = document.createElement('div');
    this.tip.className = 'ds-tip';

    this.panel = document.createElement('div');
    this.panel.className = 'ds-panel';

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'ds-toast';

    this.magnifier = new Magnifier();
    this.picker = new ColorPicker({
      onPick: (hex) => this.toast(`已复制 ${hex}`),
      onZoomChange: (zoom) => {
        this.store.settings.pickerZoom = zoom;
        void this.saveSettings();
      },
    });

    this.root.append(this.overlay, this.highlight, this.tip, this.panel, this.toastEl);
    document.documentElement.appendChild(this.host);
  }

  async init(): Promise<void> {
    this.bindEvents();
    await this.initStore();
    this.magnifier?.setZoom(this.store.settings.magnifierZoom);
    this.applyInitialPanelPosition();
    this.render();
    await this.ensureTestPageSetup();
  }

  /**
   * 测试页自动配置（仅当 URL 包含 test-page.html 时生效）：
   * 读测试页暴露的 __DS_TEST_COORDS__() 实时坐标，写两套快捷键组，
   * 跳过手动录键/拾取步骤，方便用真实快捷键触发测试。
   */
  private async ensureTestPageSetup(): Promise<void> {
    if (!/test-page\.html/i.test(location.pathname)) return;
    if (typeof this.tabId !== 'number') return;

    const coordsFn = (window as unknown as { __DS_TEST_COORDS__?: () =>
      | { drag?: { start: Point; end: Point }; area?: Rect }
      | null }).__DS_TEST_COORDS__;
    if (typeof coordsFn !== 'function') return;

    // 等测试页 DOM 渲染完成，坐标才准确
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const coords = coordsFn();
    if (!coords) return;

    const groups: ShortcutGroup[] = [];
    // 清掉之前的测试快捷键（id 以 'test-' 开头）
    const filtered = this.store.groups.filter((g) => !/^test-/.test(g.id));

    if (coords.drag) {
      groups.push({
        id: `test-drag-${Date.now()}`,
        type: 'drag',
        key: 'q',
        enabled: true,
        duration: 700,
        start: coords.drag.start,
        end: coords.drag.end,
      });
    }
    if (coords.area) {
      groups.push({
        id: `test-area-${Date.now()}`,
        type: 'area',
        key: 'w',
        enabled: true,
        duration: null,
        area: coords.area,
      });
    }

    if (!groups.length) return;

    const merged = [...filtered, ...groups];
    // 同 key 自动去重（保留较新的）
    const seen = new Set<string>();
    const deduped: ShortcutGroup[] = [];
    for (let i = merged.length - 1; i >= 0; i -= 1) {
      const g = merged[i];
      if (g.enabled && seen.has(g.key)) continue;
      seen.add(g.key);
      deduped.unshift(g);
    }

    this.store.groups = deduped;
    const { groupsKey } = this.tabKeys();
    await chrome.storage.local.set({ [groupsKey]: deduped });

    // 把面板显示出来，方便手动检查/停用
    this.panelOpen = true;
    this.render();
  }

  private tabKeys(): { groupsKey: string; settingsKey: string } {
    const id = this.tabId ?? 0;
    return { groupsKey: `ds:groups:${id}`, settingsKey: `ds:settings:${id}` };
  }

  private async initStore(): Promise<void> {
    // 先问 background 拿到 tabId 和该 tab 的数据
    let reply: { ok: true; tabId: number; groups?: ShortcutGroup[]; settings?: Partial<Settings> } |
      { ok: false; error: string } | undefined;
    try {
      reply = (await chrome.runtime.sendMessage({ type: 'whoami' })) as typeof reply;
    } catch {
      reply = undefined;
    }
    if (!reply || !reply.ok) {
      // 降级：没有 tabId 就用临时 key（极少见，只在扩展完全无法通信时）
      this.tabId = null;
      this.store = { groups: [], settings: { ...DEFAULT_SETTINGS } };
      return;
    }
    this.tabId = reply.tabId;

    const { groupsKey, settingsKey } = this.tabKeys();

    // 如果当前 tab 还没有专用数据，尝试从旧的全局键迁移一次
    const existing = (await chrome.storage.local.get([groupsKey, settingsKey])) as Record<string, unknown>;
    const hasGroups = Array.isArray(existing[groupsKey]) && (existing[groupsKey] as unknown[]).length > 0;
    const hasSettings = existing[settingsKey] != null;

    let groups: ShortcutGroup[] = [];
    let settings: Partial<Settings> = {};

    if (hasGroups || hasSettings) {
      groups = (existing[groupsKey] as ShortcutGroup[]) ?? [];
      settings = (existing[settingsKey] as Partial<Settings>) ?? {};
    } else {
      // 旧版本数据迁移：读全局 groups/settings，写进当前 tab 的 key
      const legacy = (await chrome.storage.local.get(['groups', 'settings'])) as {
        groups?: ShortcutGroup[];
        settings?: Partial<Settings>;
      };
      if (Array.isArray(legacy.groups) && legacy.groups.length > 0) {
        groups = legacy.groups;
        settings = legacy.settings ?? {};
        await chrome.storage.local.set({
          [groupsKey]: groups,
          [settingsKey]: settings,
        });
      }
    }

    this.store.groups = groups
      .map((group) => ({
        ...group,
        type: (group.type ?? 'drag') as ShortcutType,
        dragFromCursor: Boolean(group.dragFromCursor),
      }))
      // 清理历史遗留：同 key 只保留一个 enabled 组（后者覆盖前者，disabled 的保留）
      .filter((group, idx, arr) => {
        if (!group.enabled) return true;
        // 如果有同 key 的 enabled 组排在它后面，把前面的干掉
        const nextIdx = arr.findIndex((g, j) => j > idx && g.enabled && g.key === group.key);
        return nextIdx === -1;
      });
    this.store.settings = { ...DEFAULT_SETTINGS, ...settings };
    if (!(this.store.settings.activeTab in TAB_LABELS)) {
      this.store.settings.activeTab = 'drag';
    }
  }

  private bindEvents(): void {
    // 阻止页面监听到面板内部的交互
    const blocked = ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'];
    for (const type of blocked) {
      this.host.addEventListener(type, (event) => event.stopPropagation(), false);
    }

    this.panel.addEventListener('click', this.onPanelClick);
    this.panel.addEventListener('change', this.onPanelChange);
    this.panel.addEventListener('pointerdown', this.onPanelPointerDown);

    this.overlay.addEventListener('pointerdown', this.onOverlayPointerDown);
    this.overlay.addEventListener('pointermove', this.onOverlayPointerMove);
    this.overlay.addEventListener('pointerup', this.onOverlayPointerUp);
    this.overlay.addEventListener('click', this.onPickClick);

    window.addEventListener('pointermove', this.onWindowPointerMove);

    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('resize', this.onWindowResize);

    // 调试入口：Console 里 dispatchEvent(new CustomEvent('ds:toggle-magnifier')) 直接触发放大镜
    document.addEventListener('ds:toggle-magnifier', () => this.magnifier?.toggle());

    chrome.runtime.onMessage.addListener((message: unknown) => {
      const type = (message as { type?: string } | null)?.type;
      if (type === 'toggle-panel') this.togglePanel();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      const { groupsKey, settingsKey } = this.tabKeys();
      if (changes[groupsKey]) {
        this.store.groups = Array.isArray(changes[groupsKey].newValue) ? changes[groupsKey].newValue : [];
        this.render();
      }
      if (changes[settingsKey]) {
        this.store.settings = { ...DEFAULT_SETTINGS, ...(changes[settingsKey].newValue ?? {}) };
        this.magnifier?.setZoom(this.store.settings.magnifierZoom);
        this.render();
      }
    });
  }

  // ---------- 面板渲染 ----------

  private render(): void {
    const settings = this.store.settings;
    const active = settings.activeTab;
    const keys = Array.from(
      new Set(this.store.groups.filter((group) => group.enabled && group.key).map((group) => group.key.toUpperCase())),
    );
    const summary = keys.length ? `按 ${keys.join(' / ')} 执行` : '点击 ＋ 新建一组';

    const groups = this.store.groups.filter((group) => group.type === active);
    const groupsHtml = groups.length
      ? groups.map((group) => this.groupCardHtml(group)).join('')
      : `<div class="ds-empty">${EMPTY_TEXT[active]}</div>`;

    const tabsHtml = (Object.keys(TAB_LABELS) as ShortcutType[])
      .map(
        (type) =>
          `<button class="ds-tab${active === type ? ' active' : ''}" data-action="switch-tab" data-tab="${type}">${TAB_LABELS[type]}</button>`,
      )
      .join('');

    const dragSettings =
      active === 'drag'
        ? `
        <label class="ds-row"><span>拖拽时长（毫秒）</span><input type="number" name="duration" min="0" max="60000" value="${settings.duration}" /></label>
        <label class="ds-row"><span>按下后停顿（毫秒）</span><input type="number" name="holdAfterPress" min="0" max="10000" value="${settings.holdAfterPress}" /></label>
        <label class="ds-row"><span>移动步数（越大越平滑）</span><input type="number" name="steps" min="1" max="500" value="${settings.steps}" /></label>`
        : '';

    const areaSettings =
      active === 'area'
        ? `
        <label class="ds-row"><span>区域点击间距（px）</span><input type="number" name="areaStep" min="1" max="500" value="${settings.areaStep}" /></label>
        <label class="ds-row"><span>点击间隔（毫秒）</span><input type="number" name="clickInterval" min="0" max="5000" value="${settings.clickInterval}" /></label>`
        : '';

    const loupeSettings =
      active === 'loupe'
        ? `
        <label class="ds-row"><span>放大倍数（1.2 – 6）</span><input type="number" name="magnifierZoom" step="0.1" min="1.2" max="6" value="${settings.magnifierZoom}" /></label>`
        : '';

    const pickerSettings =
      active === 'picker'
        ? `
        <label class="ds-row"><span>取色默认倍数（2 – 24）</span><input type="number" name="pickerZoom" step="1" min="2" max="24" value="${settings.pickerZoom}" /></label>`
        : '';

    this.panel.innerHTML = `
      <div class="ds-hd">
        <div class="ds-hd-title">快捷操作<span class="ds-hd-sub">${escapeHtml(summary)}</span></div>
        <button class="ds-icon-btn" data-action="close" title="关闭">✕</button>
      </div>
      <div class="ds-body">
        <div class="ds-tabs">${tabsHtml}</div>
        ${this.wizard ? this.statusHtml() : ''}
        <button class="ds-new" data-action="new-group">${this.newButtonText(active)}</button>
        <div class="ds-groups">${groupsHtml}</div>
        <div class="ds-divider"></div>
        ${dragSettings}
        ${areaSettings}
        ${loupeSettings}
        ${pickerSettings}
        <label class="ds-check">
          <input type="checkbox" name="highCompat" ${settings.highCompat ? 'checked' : ''} />
          <span class="ds-check-text">
            <strong>高兼容模式（真实输入，可拖原生元素/图片）</strong>
            <span class="ds-hint">默认用页面内模拟事件，兼容大多数拖拽/点击组件；遇到拖不动或点击无响应（原生 draggable、文件、游戏），打开高兼容模式。</span>
          </span>
        </label>
        <label class="ds-check">
          <input type="checkbox" name="allEnabled" ${settings.allEnabled ? 'checked' : ''} />
          <span class="ds-check-text"><strong>全部启用</strong></span>
        </label>
      </div>
    `;

    this.panel.style.display = this.panelOpen ? 'block' : 'none';
  }

  private newButtonText(type: ShortcutType): string {
    switch (type) {
      case 'drag':
        return '＋ 新建拖拽（录键 → 拾起点 → 拾终点）';
      case 'area':
        return '＋ 新建区域（录键 → 框选区域）';
      case 'point':
        return '＋ 新建定点（录键 → 拾取位置）';
      case 'loupe':
        return '＋ 新建放大镜快捷键（录键即可）';
      case 'picker':
        return '＋ 新建取色快捷键（录键即可）';
    }
  }

  private statusHtml(): string {
    const wizard = this.wizard;
    if (!wizard) return '';
    let text = '';
    if (wizard.mode === 'record-key') {
      text = '请按下要绑定的按键（Esc 取消）';
    } else if (wizard.mode === 'pick') {
      text = wizard.stage === 'start' ? '请在页面上点击拖拽起点（Esc 取消）' : '请在页面上点击拖拽终点（Esc 取消）';
    } else if (wizard.mode === 'pick-point') {
      text = '请在页面上点击要触发的位置（Esc 取消）';
    } else {
      text = '按住鼠标拖拽框选区域（Esc 取消）';
    }
    return `<div class="ds-status"><span>${text}</span><button data-action="cancel-wizard">取消</button></div>`;
  }

  private groupCardHtml(group: ShortcutGroup): string {
    const id = escapeHtml(group.id);
    const chips: string[] = [];
    if (group.type === 'loupe' || group.type === 'picker') {
      // 放大镜 / 取色不需要坐标编辑按钮
    } else if (group.type === 'drag') {
      if (!group.dragFromCursor) {
        chips.push(`<button data-action="pick-start" data-id="${id}">改起点</button>`);
      }
      chips.push(`<button data-action="pick-end" data-id="${id}">改终点</button>`);
      chips.push(
        `<button data-action="toggle-drag-live-start" data-id="${id}">${group.dragFromCursor ? '起点=固定' : '起点=当前鼠标'}</button>`,
      );
    } else if (group.type === 'area') {
      chips.push(`<button data-action="draw-area" data-id="${id}">重框区域</button>`);
    } else {
      chips.push(`<button data-action="pick-point" data-id="${id}">改位置</button>`);
    }
    chips.push(`<button data-action="rebind" data-id="${id}">改按键</button>`);
    chips.push(`<button data-action="test" data-id="${id}">试跑</button>`);
    if (group.type === 'drag') {
      chips.push(`<button data-action="focus-duration" data-id="${id}">时长</button>`);
    }

    const durationInput =
      group.type === 'drag'
        ? `<input class="ds-duration" type="number" min="0" max="60000" data-action="group-duration" data-id="${id}" placeholder="${this.store.settings.duration}" value="${group.duration ?? ''}" />`
        : '';

    return `
      <div class="ds-card${group.enabled ? '' : ' off'}">
        <div class="ds-card-top">
          <span class="ds-key">${escapeHtml(group.key.toUpperCase())}</span>
          <span class="ds-coords">${this.groupMeta(group)}</span>
        </div>
        <div class="ds-chips">${chips.join('')}</div>
        <div class="ds-card-bottom">
          ${durationInput}
          <button data-action="toggle-group" data-id="${id}">${group.enabled ? '停用' : '启用'}</button>
          <button class="danger" data-action="delete-group" data-id="${id}">删除</button>
        </div>
      </div>
    `;
  }

  private groupMeta(group: ShortcutGroup): string {
    if (group.type === 'loupe') {
      return group.duration != null ? `放大镜 · 时长覆盖 ${group.duration}ms` : '放大镜 · 随时开关';
    }
    if (group.type === 'picker') {
      return '取色 · 移动鼠标预览，点击复制 HEX';
    }
    if (group.type === 'drag') {
      if (!group.end) return '坐标未完成';
      if (group.dragFromCursor) {
        return `当前鼠标 → ${group.end.x}, ${group.end.y}`;
      }
      if (!group.start) return '坐标未完成';
      return `${group.start.x}, ${group.start.y} → ${group.end.x}, ${group.end.y}`;
    }
    if (group.type === 'point') {
      if (!group.point) return '位置未设置';
      return `${group.point.x}, ${group.point.y}`;
    }
    if (!group.area) return '区域未设置';
    const count = countAreaPoints(group.area, this.store.settings.areaStep);
    return `${group.area.x}, ${group.area.y} · ${group.area.width}×${group.area.height} · ${count} 点`;
  }

  // ---------- 面板交互 ----------

  private onPanelClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;

    switch (action) {
      case 'close':
        this.panelOpen = false;
        this.cancelWizard();
        break;
      case 'cancel-wizard':
        this.cancelWizard();
        break;
      case 'switch-tab': {
        const tab = button.dataset.tab as ShortcutType | undefined;
        if (tab && tab !== this.store.settings.activeTab) {
          this.cancelWizard();
          this.store.settings.activeTab = tab;
          void this.saveSettings();
          this.render();
        }
        break;
      }
      case 'new-group':
        this.startNewGroup();
        break;
      case 'pick-start':
        if (id) this.startPickDrag(id, 'start');
        break;
      case 'pick-end':
        if (id) this.startPickDrag(id, 'end');
        break;
      case 'toggle-drag-live-start': {
        const group = this.findGroup(id);
        if (id && group && group.type === 'drag') {
          group.dragFromCursor = !group.dragFromCursor || undefined;
          // 切回固定模式时如果还没有 start，进入拾取
          if (!group.dragFromCursor && !group.start) {
            void this.saveGroups().then(() => this.startPickDrag(id, 'start'));
          } else {
            void this.saveGroups();
          }
        }
        break;
      }
      case 'pick-point':
        if (id) this.startPickPoint(id);
        break;
      case 'draw-area':
        if (id) this.startDrawArea(id);
        break;
      case 'rebind':
        if (id) this.startRebind(id);
        break;
      case 'test': {
        const group = this.findGroup(id);
        if (group) void this.runGroup(group, true);
        break;
      }
      case 'focus-duration': {
        const input = this.panel.querySelector<HTMLInputElement>(`.ds-duration[data-id="${id}"]`);
        input?.focus();
        input?.select();
        break;
      }
      case 'toggle-group':
        if (id) void this.toggleGroup(id);
        break;
      case 'delete-group':
        if (id) void this.deleteGroup(id);
        break;
      default:
        break;
    }
  };

  private onPanelChange = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    if (input.dataset.action === 'group-duration') {
      void this.updateGroupDuration(input.dataset.id ?? '', input.value);
      return;
    }

    switch (input.name) {
      case 'duration':
      case 'holdAfterPress':
      case 'steps':
      case 'areaStep':
      case 'clickInterval':
      case 'pickerZoom':
        void this.updateNumberSetting(input.name, input);
        break;
      case 'magnifierZoom':
        void this.updateZoom(input);
        break;
      case 'highCompat':
        void this.updateBooleanSetting('highCompat', input.checked);
        break;
      case 'allEnabled':
        void this.updateBooleanSetting('allEnabled', input.checked);
        break;
      default:
        break;
    }
  };

  private onPanelPointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.ds-hd') || target.closest('button')) return;

    const rect = this.panel.getBoundingClientRect();
    this.dragState = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    this.panel.setPointerCapture(event.pointerId);
    document.addEventListener('pointermove', this.onPanelPointerMove, true);
    document.addEventListener('pointerup', this.onPanelPointerUp, true);
  };

  private onPanelPointerMove = (event: PointerEvent): void => {
    if (!this.dragState) return;
    this.applyPanelPosition(event.clientX - this.dragState.dx, event.clientY - this.dragState.dy);
  };

  private onPanelPointerUp = (): void => {
    if (!this.dragState) return;
    this.dragState = null;
    document.removeEventListener('pointermove', this.onPanelPointerMove, true);
    document.removeEventListener('pointerup', this.onPanelPointerUp, true);
    this.store.settings.panel = {
      left: Number.parseFloat(this.panel.style.left) || 0,
      top: Number.parseFloat(this.panel.style.top) || 0,
    };
    void this.saveSettings();
  };

  private onWindowResize = (): void => {
    this.applyPanelPosition(
      Number.parseFloat(this.panel.style.left) || 0,
      Number.parseFloat(this.panel.style.top) || 0,
    );
  };

  private onWindowPointerMove = (event: PointerEvent): void => {
    this.lastMouse = { x: Math.round(event.pageX), y: Math.round(event.pageY) };
  };

  private applyInitialPanelPosition(): void {
    const saved = this.store.settings.panel;
    const left = saved?.left ?? Math.max(12, window.innerWidth - PANEL_WIDTH - 24);
    const top = saved?.top ?? 24;
    this.applyPanelPosition(left, top);
  }

  private applyPanelPosition(left: number, top: number): void {
    const maxLeft = Math.max(4, window.innerWidth - PANEL_WIDTH - 8);
    const maxTop = Math.max(4, window.innerHeight - 64);
    this.panel.style.left = `${Math.round(Math.min(Math.max(left, 4), maxLeft))}px`;
    this.panel.style.top = `${Math.round(Math.min(Math.max(top, 4), maxTop))}px`;
  }

  private togglePanel(): void {
    this.panelOpen = !this.panelOpen;
    if (!this.panelOpen) {
      this.wizard = null;
      this.endPicking();
    }
    this.render();
  }

  private toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }

  // ---------- 快捷键录制 / 坐标拾取 ----------

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      // ESC 优先级：先关放大镜 → 再取消 wizard
      if (this.magnifier?.isOpen) {
        event.preventDefault();
        event.stopPropagation();
        this.magnifier.close();
        return;
      }
      if (this.wizard) {
        event.preventDefault();
        event.stopPropagation();
        this.cancelWizard();
        return;
      }
    }

    // 取色器打开时：再按一次它的快捷键直接关闭；
    // 其余按键（+/- 调倍数、Esc 取消等）交给取色器自己的监听器处理
    if (this.picker?.isOpen) {
      const key = normalizeKey(event);
      const pickerKeys = new Set(
        this.store.groups.filter((item) => item.enabled && item.type === 'picker').map((item) => item.key),
      );
      if (
        key &&
        pickerKeys.has(key) &&
        !event.repeat &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.picker.close();
      }
      return;
    }

    if (this.wizard?.mode === 'record-key') {
      if (event.repeat || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = normalizeKey(event);
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      this.wizard.draft.key = key;
      void this.afterKeyRecorded();
      return;
    }

    // 放大镜开着时：再按一次它的快捷键就直接销毁，
    // 不受焦点在面板里 / 输入框里 / 正在执行任务等状态影响
    if (this.magnifier?.isOpen) {
      const key = normalizeKey(event);
      const loupeKeys = new Set(
        this.store.groups.filter((item) => item.enabled && item.type === 'loupe').map((item) => item.key),
      );
      if (
        key &&
        loupeKeys.has(key) &&
        !event.repeat &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.magnifier.close();
        return;
      }
    }

    if (this.wizard || this.picking || this.running) return;
    if (!this.store.settings.allEnabled) return;
    if (event.repeat || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.composedPath().includes(this.host)) return;
    if (isEditableTarget(event.target)) return;

    const key = normalizeKey(event);
    if (!key) return;
    const group = this.store.groups.find((item) => item.enabled && item.key === key);
    if (!group) return;

    event.preventDefault();
    event.stopPropagation();
    void this.runGroup(group, false);
  };

  private startNewGroup(): void {
    if (this.running) return;
    const type = this.store.settings.activeTab;
    this.wizard = {
      mode: 'record-key',
      stage: 'start',
      draft: {
        id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        key: '',
        enabled: true,
        duration: null,
        dragFromCursor: false,
        start: null,
        end: null,
        point: null,
        area: null,
      },
    };
    this.endPicking();
    this.render();
  }

  private toDraft(group: ShortcutGroup): GroupDraft {
    return {
      id: group.id,
      type: group.type,
      key: group.key,
      enabled: group.enabled,
      duration: group.duration,
      dragFromCursor: Boolean(group.dragFromCursor),
      start: group.start ? { ...group.start } : null,
      end: group.end ? { ...group.end } : null,
      point: group.point ? { ...group.point } : null,
      area: group.area ? { ...group.area } : null,
    };
  }

  private startRebind(id: string): void {
    const group = this.findGroup(id);
    if (!group) return;
    this.wizard = { mode: 'record-key', stage: 'start', draft: this.toDraft(group) };
    this.endPicking();
    this.render();
  }

  private startPickDrag(id: string, stage: 'start' | 'end'): void {
    const group = this.findGroup(id);
    if (!group || group.type !== 'drag') return;
    this.wizard = { mode: 'pick', stage, draft: this.toDraft(group) };
    this.beginPicking();
    this.render();
  }

  private startPickPoint(id: string): void {
    const group = this.findGroup(id);
    if (!group || group.type !== 'point') return;
    this.wizard = { mode: 'pick-point', stage: 'start', draft: this.toDraft(group) };
    this.beginPicking();
    this.render();
  }

  private startDrawArea(id: string): void {
    const group = this.findGroup(id);
    if (!group || group.type !== 'area') return;
    this.wizard = { mode: 'draw-area', stage: 'start', draft: this.toDraft(group) };
    this.beginPicking();
    this.render();
  }

  private async afterKeyRecorded(): Promise<void> {
    const wizard = this.wizard;
    if (!wizard) return;
    if (this.isDraftComplete(wizard.draft)) {
      await this.commitWizard();
      return;
    }
    this.advanceWizard(wizard);
    this.render();
  }

  private advanceWizard(wizard: Wizard): void {
    const draft = wizard.draft;
    if (draft.type === 'drag') {
      wizard.mode = 'pick';
      // 起点取当前鼠标的模式不需要拾起点，直接进入终点拾取
      if (draft.dragFromCursor) {
        wizard.stage = 'end';
      } else {
        wizard.stage = !draft.start ? 'start' : 'end';
      }
    } else if (draft.type === 'point') {
      wizard.mode = 'pick-point';
    } else {
      wizard.mode = 'draw-area';
    }
    this.beginPicking();
  }

  private beginPicking(): void {
    this.picking = true;
    this.overlay.classList.add('active');
    this.highlight.style.display = 'none';
    this.tip.style.display = 'none';
  }

  private endPicking(): void {
    this.picking = false;
    this.drawAnchor = null;
    this.overlay.classList.remove('active');
    this.overlay.style.pointerEvents = '';
    this.highlight.style.display = 'none';
    this.tip.style.display = 'none';
  }

  private onOverlayPointerDown = (event: PointerEvent): void => {
    if (!this.picking || this.wizard?.mode !== 'draw-area') return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.drawAnchor = { x: Math.round(event.pageX), y: Math.round(event.pageY) };
    try {
      this.overlay.setPointerCapture(event.pointerId);
    } catch {
      // 忽略无法捕获指针的情况
    }
    this.updateDrawPreview(event);
  };

  private onOverlayPointerMove = (event: PointerEvent): void => {
    const wizard = this.wizard;
    if (!wizard || !this.picking) return;

    if (wizard.mode === 'draw-area') {
      if (!this.drawAnchor) return;
      event.preventDefault();
      this.updateDrawPreview(event);
      return;
    }

    if (wizard.mode !== 'pick' && wizard.mode !== 'pick-point') return;

    const x = event.clientX;
    const y = event.clientY;

    this.overlay.style.pointerEvents = 'none';
    const element = document.elementFromPoint(x, y);
    this.overlay.style.pointerEvents = '';

    if (element) {
      const rect = element.getBoundingClientRect();
      this.highlight.style.display = 'block';
      this.highlight.style.left = `${rect.left}px`;
      this.highlight.style.top = `${rect.top}px`;
      this.highlight.style.width = `${rect.width}px`;
      this.highlight.style.height = `${rect.height}px`;
    }

    this.tip.style.display = 'block';
    this.tip.textContent = `${Math.round(event.pageX)}, ${Math.round(event.pageY)}${
      element ? `  ${describeElement(element)}` : ''
    }`;
    this.positionTip(x, y);
  };

  private onOverlayPointerUp = (event: PointerEvent): void => {
    const wizard = this.wizard;
    if (!wizard || wizard.mode !== 'draw-area' || !this.drawAnchor) return;
    event.preventDefault();
    event.stopPropagation();

    const anchor = this.drawAnchor;
    this.drawAnchor = null;
    const rect = rectFromPoints(anchor, { x: event.pageX, y: event.pageY });
    if (rect.width < 2 && rect.height < 2) {
      this.toast('区域太小，请重新框选');
      this.highlight.style.display = 'none';
      this.tip.style.display = 'none';
      return;
    }

    wizard.draft.area = rect;
    this.endPicking();
    void this.commitWizard();
  };

  private updateDrawPreview(event: PointerEvent): void {
    const anchor = this.drawAnchor;
    if (!anchor) return;
    const rect = rectFromPoints(anchor, { x: event.pageX, y: event.pageY });
    const left = rect.x - window.scrollX;
    const top = rect.y - window.scrollY;

    this.highlight.style.display = 'block';
    this.highlight.style.left = `${left}px`;
    this.highlight.style.top = `${top}px`;
    this.highlight.style.width = `${rect.width}px`;
    this.highlight.style.height = `${rect.height}px`;

    const count = countAreaPoints(rect, this.store.settings.areaStep);
    this.tip.style.display = 'block';
    this.tip.textContent = `${rect.width} × ${rect.height} · 约 ${count} 次点击`;
    this.positionTip(event.clientX, event.clientY);
  }

  private positionTip(x: number, y: number): void {
    const tipX = Math.min(x + 14, window.innerWidth - this.tip.offsetWidth - 8);
    const tipY = Math.min(y + 18, window.innerHeight - this.tip.offsetHeight - 8);
    this.tip.style.left = `${Math.max(6, tipX)}px`;
    this.tip.style.top = `${Math.max(6, tipY)}px`;
  }

  private onPickClick = (event: MouseEvent): void => {
    const wizard = this.wizard;
    if (!this.picking || !wizard) return;
    if (wizard.mode !== 'pick' && wizard.mode !== 'pick-point') return;
    event.preventDefault();
    event.stopPropagation();
    void this.handlePick(event);
  };

  private async handlePick(event: MouseEvent): Promise<void> {
    const wizard = this.wizard;
    if (!wizard) return;

    const point: Point = { x: Math.round(event.pageX), y: Math.round(event.pageY) };
    if (wizard.mode === 'pick') {
      if (wizard.stage === 'start') {
        wizard.draft.start = point;
      } else {
        wizard.draft.end = point;
      }
    } else if (wizard.mode === 'pick-point') {
      wizard.draft.point = point;
    } else {
      return;
    }

    this.endPicking();
    if (!this.isDraftComplete(wizard.draft)) {
      this.advanceWizard(wizard);
      this.render();
      return;
    }
    await this.commitWizard();
  }

  private isDraftComplete(draft: GroupDraft): boolean {
    if (!draft.key) return false;
    if (draft.type === 'loupe' || draft.type === 'picker') return true;
    if (draft.type === 'drag') {
      if (draft.dragFromCursor) return Boolean(draft.end);
      return Boolean(draft.start && draft.end);
    }
    if (draft.type === 'point') return Boolean(draft.point);
    return Boolean(draft.area);
  }

  private async commitWizard(): Promise<void> {
    const draft = this.wizard?.draft;
    this.wizard = null;
    this.endPicking();
    if (!draft || !this.isDraftComplete(draft)) {
      this.render();
      return;
    }

    const group: ShortcutGroup = {
      id: draft.id,
      type: draft.type,
      key: draft.key,
      enabled: draft.enabled,
      duration: draft.duration,
      dragFromCursor: draft.dragFromCursor || undefined,
      start: draft.start ?? undefined,
      end: draft.end ?? undefined,
      point: draft.point ?? undefined,
      area: draft.area ?? undefined,
    };

    // 冲突处理：如果新建/保存的组 key 被其他 enabled 组占用，把旧的自动停用
    // （避免数组里多个同 key 的 enabled 组并存，删了一个另一个还能触发）
    const conflicting = this.store.groups.filter(
      (item) => item.id !== group.id && item.key === group.key && item.enabled,
    );
    if (conflicting.length > 0) {
      for (const old of conflicting) old.enabled = false;
      this.toast(`已自动停用同按键的旧配置（${conflicting.length} 组）`);
    }

    const index = this.store.groups.findIndex((item) => item.id === group.id);
    if (index >= 0) {
      this.store.groups[index] = group;
    } else {
      this.store.groups.push(group);
    }
    await this.saveGroups();
    this.render();
    this.toast(`已保存：${group.key.toUpperCase()} · ${TAB_LABELS[group.type]}`);
  }

  private cancelWizard(): void {
    this.wizard = null;
    this.endPicking();
    this.render();
  }

  // ---------- 数据操作 ----------

  private findGroup(id: string | undefined): ShortcutGroup | undefined {
    if (!id) return undefined;
    return this.store.groups.find((group) => group.id === id);
  }

  private async toggleGroup(id: string): Promise<void> {
    const group = this.findGroup(id);
    if (!group) return;
    group.enabled = !group.enabled;
    await this.saveGroups();
    this.render();
  }

  private async deleteGroup(id: string): Promise<void> {
    const index = this.store.groups.findIndex((group) => group.id === id);
    if (index < 0) return;
    if (this.wizard?.draft.id === id) {
      this.wizard = null;
      this.endPicking();
    }
    this.store.groups.splice(index, 1);
    await this.saveGroups();
    this.render();
  }

  private async updateGroupDuration(id: string, raw: string): Promise<void> {
    const group = this.findGroup(id);
    if (!group) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      group.duration = null;
    } else {
      const value = Math.round(Number(trimmed));
      group.duration = Number.isFinite(value) ? Math.max(0, Math.min(60000, value)) : null;
    }
    await this.saveGroups();
  }

  private async updateNumberSetting(
    name: 'duration' | 'holdAfterPress' | 'steps' | 'areaStep' | 'clickInterval' | 'pickerZoom',
    input: HTMLInputElement,
  ): Promise<void> {
    const [min, max] = LIMITS[name];
    const fallback = this.store.settings[name];
    let value = Math.round(Number(input.value));
    if (!Number.isFinite(value)) value = fallback;
    value = Math.min(max, Math.max(min, value));
    this.store.settings[name] = value;
    input.value = String(value);
    await this.saveSettings();
  }

  private async updateZoom(input: HTMLInputElement): Promise<void> {
    const [min, max] = LIMITS.magnifierZoom;
    let value = Number(input.value);
    if (!Number.isFinite(value)) value = this.store.settings.magnifierZoom;
    // 保留一位小数
    value = Math.min(max, Math.max(min, Math.round(value * 10) / 10));
    this.store.settings.magnifierZoom = value;
    input.value = String(value);
    this.magnifier?.setZoom(value);
    await this.saveSettings();
  }

  private async updateBooleanSetting(
    name: 'highCompat' | 'allEnabled',
    checked: boolean,
  ): Promise<void> {
    this.store.settings[name] = checked;
    await this.saveSettings();
    if (name === 'allEnabled' && !checked) {
      this.toast('已关闭全部快捷键');
    }
  }

  private async saveGroups(): Promise<void> {
    try {
      const { groupsKey } = this.tabKeys();
      await chrome.storage.local.set({ [groupsKey]: this.store.groups });
    } catch {
      this.toast('保存失败：扩展可能已被重新加载');
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      const { settingsKey } = this.tabKeys();
      await chrome.storage.local.set({ [settingsKey]: this.store.settings });
    } catch {
      this.toast('保存失败：扩展可能已被重新加载');
    }
  }

  // ---------- 执行动作 ----------

  private toClient(point: Point): Point {
    return { x: point.x - window.scrollX, y: point.y - window.scrollY };
  }

  private async preparePoints(start: Point, end: Point): Promise<{ start: Point; end: Point }> {
    const inView = (point: Point): boolean =>
      point.x >= 0 && point.x <= window.innerWidth && point.y >= 0 && point.y <= window.innerHeight;

    let startClient = this.toClient(start);
    let endClient = this.toClient(end);

    if (!inView(startClient) || !inView(endClient)) {
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);

      const horizontalSpan = maxX - minX;
      const verticalSpan = maxY - minY;

      const left =
        horizontalSpan <= window.innerWidth - 32
          ? Math.min(minX - 16, maxX + 16 - window.innerWidth)
          : start.x - Math.round(window.innerWidth / 3);

      const top =
        verticalSpan <= window.innerHeight - 32
          ? Math.min(minY - 16, maxY + 16 - window.innerHeight)
          : start.y - Math.round(window.innerHeight / 3);

      const maxScrollX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

      window.scrollTo({
        left: Math.min(Math.max(0, left), maxScrollX),
        top: Math.min(Math.max(0, top), maxScrollY),
        behavior: 'auto',
      });
      await sleep(60);

      startClient = this.toClient(start);
      endClient = this.toClient(end);
    }

    const clamp = (point: Point): Point => ({
      x: Math.min(Math.max(point.x, 1), window.innerWidth - 1),
      y: Math.min(Math.max(point.y, 1), window.innerHeight - 1),
    });
    return { start: clamp(startClient), end: clamp(endClient) };
  }

  private async runGroup(group: ShortcutGroup, isTest: boolean): Promise<void> {
    // 放大镜是 toggle 开关，不走阻塞的 running 流程
    if (group.type === 'loupe') {
      this.magnifier?.toggle();
      if (isTest) {
        this.toast(this.magnifier?.isOpen ? '放大镜已开启（再次按键或 ESC 关闭）' : '放大镜已关闭');
      }
      return;
    }

    // 取色器也是交互式开关，不走 running 流程
    if (group.type === 'picker') {
      if (this.running || this.picking || this.wizard) return;
      await this.openPicker();
      return;
    }

    if (this.running || this.picking || this.wizard) return;
    this.running = true;
    this.panel.style.pointerEvents = 'none';

    try {
      if (group.type === 'drag') {
        await this.executeDrag(group);
      } else if (group.type === 'point') {
        await this.executePoint(group);
      } else {
        await this.executeArea(group);
      }
      if (isTest && group.type !== 'area') {
        this.toast('试跑完成');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.toast(`执行失败：${message}`);
    } finally {
      this.running = false;
      this.panel.style.pointerEvents = '';
    }
  }

  private async openPicker(): Promise<void> {
    if (!this.picker || this.picker.isOpen) return;
    // 截图前隐藏自己的面板，避免被拍进取色画面
    this.host.style.visibility = 'hidden';
    try {
      const initial = this.lastMouse
        ? { x: this.lastMouse.x - window.scrollX, y: this.lastMouse.y - window.scrollY }
        : undefined;
      await this.picker.open(this.store.settings.pickerZoom, initial);
    } catch (error) {
      this.toast(`取色失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.host.style.visibility = '';
    }
  }

  private async executeDrag(group: ShortcutGroup): Promise<void> {
    let startPage: Point;
    if (group.dragFromCursor) {
      if (!this.lastMouse) {
        throw new Error('还没有记录到鼠标位置，请先在页面上移动一下鼠标');
      }
      startPage = { ...this.lastMouse };
    } else {
      if (!group.start) throw new Error('拖拽起点未设置');
      startPage = { ...group.start };
    }
    if (!group.end) throw new Error('拖拽终点未设置');
    const points = await this.preparePoints(startPage, group.end);
    const duration = group.duration ?? this.store.settings.duration;
    const hold = this.store.settings.holdAfterPress;
    const steps = this.store.settings.steps;

    if (this.store.settings.highCompat) {
      const payload: CdpDragPayload = { start: points.start, end: points.end, duration, hold, steps };
      const result = (await chrome.runtime.sendMessage({ type: 'cdp-drag', payload })) as
        | { ok?: boolean; error?: string }
        | undefined;
      if (!result?.ok) throw new Error(result?.error || '高兼容模式执行失败');
      return;
    }

    await simulateDrag({ start: points.start, end: points.end, duration, hold, steps });
  }

  private async executePoint(group: ShortcutGroup): Promise<void> {
    if (!group.point) throw new Error('点击位置未设置');
    const points = await this.preparePoints(group.point, group.point);
    await this.performClicks([points.start], 0);
  }

  private async executeArea(group: ShortcutGroup): Promise<void> {
    if (!group.area) throw new Error('点击区域未设置');
    const step = Math.max(1, Math.round(this.store.settings.areaStep));
    const interval = Math.max(0, Math.round(this.store.settings.clickInterval));
    const total = countAreaPoints(group.area, step);
    if (total > 200000) {
      throw new Error(`区域点数为 ${total}，请增大间距`);
    }

    this.toast(`区域点击开始：${total} 次`);
    const clicked = await this.clickArea(group.area, step, interval);
    this.toast(`区域点击完成：${clicked} 次`);
  }

  private async performClicks(points: Point[], interval: number): Promise<number> {
    if (!points.length) return 0;

    if (this.store.settings.highCompat) {
      const payload: CdpClicksPayload = { points, interval };
      const result = (await chrome.runtime.sendMessage({ type: 'cdp-clicks', payload })) as
        | { ok?: boolean; error?: string }
        | undefined;
      if (!result?.ok) throw new Error(result?.error || '高兼容模式执行失败');
      return points.length;
    }

    for (const point of points) {
      simulateClick(point);
      await sleep(interval);
    }
    return points.length;
  }

  private async clickArea(rect: Rect, step: number, interval: number): Promise<number> {
    const xs: number[] = [];
    for (let x = rect.x; x <= rect.x + rect.width; x += step) xs.push(x);
    const ys: number[] = [];
    for (let y = rect.y; y <= rect.y + rect.height; y += step) ys.push(y);

    await this.preparePoints({ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height });

    let clicked = 0;
    let batch: Point[] = [];

    const flush = async (): Promise<void> => {
      if (!batch.length) return;
      clicked += await this.performClicks(batch, interval);
      batch = [];
    };

    for (const pageY of ys) {
      let clientY = pageY - window.scrollY;
      if (clientY < 2 || clientY > window.innerHeight - 2) {
        await flush();
        const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo({
          top: Math.min(Math.max(0, pageY - Math.round(window.innerHeight / 2)), maxScrollY),
          left: window.scrollX,
          behavior: 'auto',
        });
        await sleep(60);
        clientY = pageY - window.scrollY;
      }
      if (clientY < 0 || clientY > window.innerHeight) continue;

      for (const pageX of xs) {
        const clientX = pageX - window.scrollX;
        if (clientX < 1 || clientX > window.innerWidth - 1) continue;
        batch.push({ x: Math.round(clientX), y: Math.round(clientY) });
      }
    }

    await flush();
    return clicked;
  }
}

declare global {
  interface Window {
    __dragShortcutLoaded?: boolean;
  }
}

if (!window.__dragShortcutLoaded) {
  window.__dragShortcutLoaded = true;
  const app = new DragShortcutApp();
  void app.init();
}
