/**
 * 放大镜（双模式）
 *
 * DOM 镜像模式（默认）：
 *   把 <body> 深拷贝一份放进镜片，每帧只改 transform（translate + scale），
 *   纯合成层位移，60fps 跟手，没有截图延迟、也不会把自己拍进去。
 *   缺点：canvas / video 画面不会被复刻（cloneNode 不复制位图）。
 *
 * 截图模式：
 *   调 chrome.tabs.captureVisibleTab 拿到当前视口截图，用 drawImage 把
 *   鼠标周围区域放大画到 canvas 镜片上。可以放大 video / canvas / iframe，
 *   但画面是冻结的，页面变动不会反映；滚动/切换页签时需重新截图。
 */

export type MagnifierMode = 'dom' | 'screenshot';

const ZOOM = 2.4; // 默认放大倍数
const ZOOM_MIN = 1.2;
const ZOOM_MAX = 6;
const LENS = 180; // 镜片边长（CSS px）
const REBUILD_INTERVAL = 1000; // DOM 模式下页面变化后最短重建间隔
const REBUILD_COST_LIMIT = 60; // DOM 模式单次重建耗时上限，超过就不再自动重建
const RESHOT_INTERVAL = 400; // 截图模式下滚动后重新截图的最短间隔

export class Magnifier {
  // ---------- 通用 ----------
  private root: HTMLDivElement | null = null;
  private lens: HTMLDivElement | null = null;

  private attached = false;
  private rafId = 0;
  private mode: MagnifierMode = 'dom';

  private mx = -1;
  private my = -1;
  private zoom = ZOOM;

  // ---------- DOM 镜像模式 ----------
  private stage: HTMLDivElement | null = null;
  private clone: HTMLElement | null = null;
  private bodyDocX = 0;
  private bodyDocY = 0;
  private calX = 1;
  private calY = 1;
  private observer: MutationObserver | null = null;
  private dirty = false;
  private lastBuild = 0;
  private lastCost = 0;

  // ---------- 截图模式 ----------
  private ctx: CanvasRenderingContext2D | null = null;
  private sampleCanvas: HTMLCanvasElement | null = null;
  private scaleX = 1;
  private scaleY = 1;
  private lastScrollX = 0;
  private lastScrollY = 0;
  private lastReshot = 0;
  private reshotPending = false;

  get isOpen(): boolean {
    return this.attached;
  }

  /** 设置放大倍数（打开状态下下一帧立即生效） */
  setZoom(value: number): void {
    if (!Number.isFinite(value)) return;
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
  }

  /** 切换模式。已打开时调用会先关再按新模式开（截图模式是异步的） */
  setMode(mode: MagnifierMode): void {
    this.mode = mode;
  }

  toggle(): void {
    if (this.attached) this.close();
    else void this.open();
  }

  destroy(): void {
    this.close();
  }

  /**
   * 打开放大镜。DOM 模式同步完成；截图模式需要 captureVisibleTab，异步。
   * 截图失败会抛错，由调用方处理。
   */
  async open(): Promise<void> {
    if (this.attached) return;

    if (this.mx < 0 || this.my < 0) {
      this.mx = Math.round(window.innerWidth / 2);
      this.my = Math.round(window.innerHeight / 2);
    }

    if (this.mode === 'screenshot') {
      await this.openScreenshot();
    } else {
      this.buildDomShell();
      this.attached = true;
      this.lens!.style.display = 'block';

      window.addEventListener('pointermove', this.onMove, true);
      window.addEventListener('resize', this.onViewportChange);

      this.observer = new MutationObserver(() => {
        this.dirty = true;
      });
      if (document.body) {
        this.observer.observe(document.body, { childList: true, subtree: true });
      }

      this.rebuildClone();
      this.loop();
    }
  }

  close(): void {
    if (!this.attached) return;
    this.attached = false;

    window.removeEventListener('pointermove', this.onMove, true);
    window.removeEventListener('resize', this.onViewportChange);
    window.removeEventListener('scroll', this.onScroll, true);

    this.observer?.disconnect();
    this.observer = null;

    cancelAnimationFrame(this.rafId);
    this.root?.remove();
    this.root = null;
    this.lens = null;
    this.stage = null;
    this.clone = null;
    this.ctx = null;
    this.sampleCanvas = null;
    this.dirty = false;
    this.reshotPending = false;
  }

  // ================================================================
  //                       DOM 镜像模式
  // ================================================================

  /** 只搭外壳（root / lens / stage / ring），内容放到 rebuildClone 里做 */
  private buildDomShell(): void {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'width:0',
      'height:0',
      `z-index:${Number.MAX_SAFE_INTEGER}`,
      'pointer-events:none',
    ].join(';');

    // 兜底：阻止镜像里的内容抢走鼠标事件
    const guard = document.createElement('style');
    guard.textContent = '.ds-mag-stage *{pointer-events:none !important;}';

    const lens = document.createElement('div');
    lens.style.cssText = [
      'position:fixed',
      'display:none',
      `width:${LENS}px`,
      `height:${LENS}px`,
      'border-radius:16px',
      'overflow:hidden',
      'pointer-events:none',
      'background:#fff',
      'box-shadow:0 10px 30px rgba(15,23,42,.35)',
    ].join(';');

    const stage = document.createElement('div');
    stage.className = 'ds-mag-stage';
    stage.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';

    const ring = this.buildRing();

    lens.append(stage, ring);
    root.append(guard, lens);
    document.documentElement.appendChild(root);

    this.root = root;
    this.lens = lens;
    this.stage = stage;
  }

  private buildRing(): HTMLDivElement {
    const ring = document.createElement('div');
    ring.style.cssText = [
      'position:absolute',
      'inset:0',
      'border-radius:16px',
      'border:2px solid rgba(22,119,255,.9)',
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.5)',
      'pointer-events:none',
    ].join(';');
    return ring;
  }

  private rebuildClone(): void {
    const stage = this.stage;
    const body = document.body;
    if (!stage || !body) return;

    const started = performance.now();
    const bodyRect = body.getBoundingClientRect();
    this.bodyDocX = bodyRect.left + window.scrollX;
    this.bodyDocY = bodyRect.top + window.scrollY;

    const copy = body.cloneNode(true) as HTMLElement;

    // 脚本/内嵌框架/插件内容复制过来没有意义
    copy.querySelectorAll('script, iframe, noscript, object, embed').forEach((node) => node.remove());
    copy.querySelectorAll('video, audio').forEach((node) => node.removeAttribute('src'));
    copy.querySelectorAll('#drag-shortcut-root').forEach((node) => node.remove());

    copy.style.cssText += [
      ';margin:0',
      'position:absolute',
      'left:0',
      'top:0',
      'transform-origin:0 0',
      'box-sizing:border-box',
      'pointer-events:none',
      'user-select:none',
      'will-change:transform',
      `width:${bodyRect.width}px`,
      `height:${bodyRect.height}px`,
    ].join(';');

    stage.replaceChildren(copy);
    this.clone = copy;

    copy.scrollTop = body.scrollTop;
    copy.scrollLeft = body.scrollLeft;

    this.calibrate();

    this.lastBuild = performance.now();
    this.lastCost = this.lastBuild - started;
    this.dirty = false;
    this.observer?.takeRecords();
    this.positionDom();
  }

  private calibrate(): void {
    const clone = this.clone;
    if (!clone) return;

    const prev = clone.style.transform;
    clone.style.transform = 'none';

    const probe = (x: number, y: number): DOMRect => {
      const el = document.createElement('div');
      el.style.cssText = [
        'position:absolute !important',
        `left:${x}px !important`,
        `top:${y}px !important`,
        'width:1px !important',
        'height:1px !important',
        'margin:0 !important',
        'padding:0 !important',
        'border:0 !important',
        'visibility:hidden !important',
        'pointer-events:none !important',
      ].join(';');
      clone.appendChild(el);
      const rect = el.getBoundingClientRect();
      el.remove();
      return rect;
    };

    const CAL = 200;
    const origin = probe(0, 0);
    const alongX = probe(CAL, 0);
    const alongY = probe(0, CAL);

    clone.style.transform = prev;

    const sx = (alongX.left - origin.left) / CAL;
    const sy = (alongY.top - origin.top) / CAL;
    this.calX = Number.isFinite(sx) && Math.abs(sx) > 0.05 ? sx : 1;
    this.calY = Number.isFinite(sy) && Math.abs(sy) > 0.05 ? sy : 1;
  }

  private loopDom = (): void => {
    if (!this.attached) return;

    const now = performance.now();
    if (
      this.dirty &&
      now - this.lastBuild > REBUILD_INTERVAL &&
      this.lastCost < REBUILD_COST_LIMIT
    ) {
      this.rebuildClone();
    }

    this.positionDom();
    this.rafId = requestAnimationFrame(this.loopDom);
  };

  private positionDom(): void {
    const lens = this.lens;
    const clone = this.clone;
    if (!lens || !clone) return;

    const left = Math.max(4, Math.min(this.mx - LENS / 2, window.innerWidth - LENS - 4));
    const top = Math.max(4, Math.min(this.my - LENS / 2, window.innerHeight - LENS - 4));
    lens.style.left = `${left}px`;
    lens.style.top = `${top}px`;

    const cursorX = this.mx + window.scrollX;
    const cursorY = this.my + window.scrollY;

    const localX = (cursorX - this.bodyDocX) / this.calX;
    const localY = (cursorY - this.bodyDocY) / this.calY;

    const tx = (this.mx - left) / this.calX - localX * this.zoom;
    const ty = (this.my - top) / this.calY - localY * this.zoom;
    clone.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${this.zoom})`;
  }

  // ================================================================
  //                       截图模式
  // ================================================================

  private async openScreenshot(): Promise<void> {
    // 先搭 DOM 壳（canvas 镜片）
    const root = document.createElement('div');
    root.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'width:0',
      'height:0',
      `z-index:${Number.MAX_SAFE_INTEGER}`,
      'pointer-events:none',
    ].join(';');

    const lens = document.createElement('div');
    lens.style.cssText = [
      'position:fixed',
      'display:none',
      `width:${LENS}px`,
      `height:${LENS}px`,
      'border-radius:16px',
      'overflow:hidden',
      'pointer-events:none',
      'background:#fff',
      'box-shadow:0 10px 30px rgba(15,23,42,.35)',
    ].join(';');

    const canvas = document.createElement('canvas');
    canvas.width = LENS;
    canvas.height = LENS;
    canvas.style.cssText = `display:block;width:${LENS}px;height:${LENS}px;`;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建放大镜 canvas');
    ctx.imageSmoothingEnabled = false;

    const ring = this.buildRing();
    lens.append(canvas, ring);
    root.appendChild(lens);
    document.documentElement.appendChild(root);

    this.root = root;
    this.lens = lens;
    this.ctx = ctx;

    // 隐藏扩展宿主，避免被截图进去
    const host = document.getElementById('drag-shortcut-root');
    const prevVisibility = host?.style.visibility ?? '';
    if (host) host.style.visibility = 'hidden';

    try {
      await this.captureFrame();
    } finally {
      if (host) host.style.visibility = prevVisibility;
    }

    this.attached = true;
    this.lens.style.display = 'block';

    // 记一下当前滚动位置，滚动超过阈值时重新截图
    this.lastScrollX = window.scrollX;
    this.lastScrollY = window.scrollY;

    window.addEventListener('pointermove', this.onMove, true);
    window.addEventListener('resize', this.onViewportChange);
    window.addEventListener('scroll', this.onScroll, true);

    this.loopScreenshot();
  }

  /** 抓一帧视口画面到离屏 canvas */
  private async captureFrame(): Promise<void> {
    const reply = (await chrome.runtime.sendMessage({ type: 'capture-tab' })) as
      | { ok: boolean; dataUrl?: string; error?: string }
      | undefined;
    if (!reply?.ok || !reply.dataUrl) {
      throw new Error(reply?.error || '截图失败，请重试');
    }

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('截图加载失败'));
      img.src = reply.dataUrl as string;
    });

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = image.naturalWidth;
    sampleCanvas.height = image.naturalHeight;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleCtx) throw new Error('无法创建截图画布');
    sampleCtx.drawImage(image, 0, 0);

    this.sampleCanvas = sampleCanvas;
    this.scaleX = image.naturalWidth / Math.max(1, window.innerWidth);
    this.scaleY = image.naturalHeight / Math.max(1, window.innerHeight);
    this.lastReshot = performance.now();
    this.reshotPending = false;
  }

  private loopScreenshot = (): void => {
    if (!this.attached) return;
    this.renderScreenshot();
    this.rafId = requestAnimationFrame(this.loopScreenshot);
  };

  private renderScreenshot(): void {
    const ctx = this.ctx;
    const lens = this.lens;
    const sampleCanvas = this.sampleCanvas;
    if (!ctx || !lens || !sampleCanvas) return;

    const left = Math.max(4, Math.min(this.mx - LENS / 2, window.innerWidth - LENS - 4));
    const top = Math.max(4, Math.min(this.my - LENS / 2, window.innerHeight - LENS - 4));
    lens.style.left = `${left}px`;
    lens.style.top = `${top}px`;

    // 以鼠标为中心，把周围 LENS/zoom 大小的区域放大到整个镜片
    const sw = (LENS / this.zoom) * this.scaleX;
    const sh = (LENS / this.zoom) * this.scaleY;
    const sx = this.mx * this.scaleX - sw / 2;
    const sy = this.my * this.scaleY - sh / 2;

    ctx.clearRect(0, 0, LENS, LENS);
    ctx.drawImage(sampleCanvas, sx, sy, sw, sh, 0, 0, LENS, LENS);
  }

  // ================================================================
  //                       事件（通用）
  // ================================================================

  private onMove = (event: PointerEvent): void => {
    this.mx = event.clientX;
    this.my = event.clientY;
  };

  private onViewportChange = (): void => {
    if (this.mode === 'dom') {
      this.dirty = true;
      this.lastBuild = 0;
    } else {
      // 窗口大小变了，截图的坐标系就不对了，重新抓
      this.scheduleReshot();
    }
  };

  /** 滚动事件只在截图模式里注册：滚动后截图坐标会错位，需要重新抓帧 */
  private onScroll = (): void => {
    if (this.mode !== 'screenshot') return;
    const dx = Math.abs(window.scrollX - this.lastScrollX);
    const dy = Math.abs(window.scrollY - this.lastScrollY);
    if (dx > 4 || dy > 4) {
      this.lastScrollX = window.scrollX;
      this.lastScrollY = window.scrollY;
      this.scheduleReshot();
    }
  };

  private scheduleReshot(): void {
    if (this.reshotPending) return;
    const now = performance.now();
    if (now - this.lastReshot < RESHOT_INTERVAL) {
      this.reshotPending = true;
      window.setTimeout(() => {
        this.reshotPending = false;
        if (this.attached) void this.captureFrame();
      }, RESHOT_INTERVAL - (now - this.lastReshot));
      return;
    }
    void this.captureFrame();
  }

  /** DOM 模式的 loop 方法引用（open 时传给 rAF） */
  private loop = (): void => {
    if (!this.attached) return;

    const now = performance.now();
    if (
      this.dirty &&
      now - this.lastBuild > REBUILD_INTERVAL &&
      this.lastCost < REBUILD_COST_LIMIT
    ) {
      this.rebuildClone();
    }

    this.positionDom();
    this.rafId = requestAnimationFrame(this.loop);
  };
}
