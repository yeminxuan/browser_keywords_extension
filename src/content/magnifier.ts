/**
 * 放大镜（DOM 镜像方案）
 *
 * 需求：以鼠标为中心，实时放大鼠标下方页面的内容（跟视频、截图权限都无关）。
 *
 * 做法：
 *   1. 打开时把 <body> 深拷贝一份放进镜片（页面样式是全局的，克隆体能正常继承样式；
 *      克隆的是 <body> 元素本身，所以 `body > xxx` 这类选择器依然命中）。
 *   2. 每帧只在 requestAnimationFrame 里改 transform（translate + scale），
 *      纯合成层位移，60fps 跟手，没有截图延迟、没有闪烁、也不会把自己拍进去。
 *   3. 鼠标下方那个点在镜片里仍落在鼠标处 —— 和实体放大镜的手感一致。
 *   4. 副本是按当前页面重新排版的，浏览器缩放不是 100%（或站点自带 CSS zoom、
 *      系统显示比例带小数）时，副本 1px 并不严格等于页面 1px。因此每次重建后
 *      都用探针实测「副本 px → 页面 px」的真实比例，坐标换算全部走实测值，
 *      否则放大后会越偏离中心越不准。
 *
 * 已知边界：canvas / video 画面不会被复刻（cloneNode 不复制位图），
 * 其余 DOM、图片、CSS 动画都是实时的。
 */

const ZOOM = 2.4; // 默认放大倍数
const ZOOM_MIN = 1.2;
const ZOOM_MAX = 6;
const LENS = 180; // 镜片边长（CSS px）
const REBUILD_INTERVAL = 1000; // 页面 DOM 变化后最短重建间隔
const REBUILD_COST_LIMIT = 60; // 单次重建耗时上限，超过就不再自动重建

export class Magnifier {
  private root: HTMLDivElement | null = null;
  private lens: HTMLDivElement | null = null;
  private stage: HTMLDivElement | null = null;
  private clone: HTMLElement | null = null;

  private attached = false;
  private rafId = 0;

  private mx = -1;
  private my = -1;

  private zoom = ZOOM;

  /** 打开时 <body> 边框盒在文档坐标系里的原点 */
  private bodyDocX = 0;
  private bodyDocY = 0;

  /** 实测比例：副本 1px 对应多少页面 px（浏览器缩放 / CSS zoom 下不一定是 1） */
  private calX = 1;
  private calY = 1;

  private observer: MutationObserver | null = null;
  private dirty = false;
  private lastBuild = 0;
  private lastCost = 0;

  get isOpen(): boolean {
    return this.attached;
  }

  /** 设置放大倍数（打开状态下下一帧立即生效） */
  setZoom(value: number): void {
    if (!Number.isFinite(value)) return;
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
  }

  toggle(): void {
    if (this.attached) this.close();
    else this.open();
  }

  destroy(): void {
    this.close();
  }

  open(): void {
    if (this.attached) return;
    this.build();
    if (!this.root || !this.lens || !this.stage) return;

    if (this.mx < 0 || this.my < 0) {
      this.mx = Math.round(window.innerWidth / 2);
      this.my = Math.round(window.innerHeight / 2);
    }

    this.attached = true;
    this.lens.style.display = 'block';

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

  close(): void {
    if (!this.attached) return;
    this.attached = false;

    window.removeEventListener('pointermove', this.onMove, true);
    window.removeEventListener('resize', this.onViewportChange);

    this.observer?.disconnect();
    this.observer = null;

    cancelAnimationFrame(this.rafId);
    this.root?.remove();
    this.root = null;
    this.lens = null;
    this.stage = null;
    this.clone = null;
    this.dirty = false;
  }

  // ---------- 事件 ----------

  private onMove = (event: PointerEvent): void => {
    this.mx = event.clientX;
    this.my = event.clientY;
  };

  private onViewportChange = (): void => {
    // 滚动/缩放后 <body> 在文档里的原点和副本的排版比例都可能变化，立即重建（下一帧）
    this.dirty = true;
    this.lastBuild = 0;
  };

  // ---------- DOM ----------

  private build(): void {
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

    // 只用于兜底：阻止镜像里的内容抢走鼠标事件（页面里普遍设了 pointer-events:auto）
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

    // 边框单独画一层：如果用 border，镜片内容区会内缩 2px，坐标换算整体偏移
    const ring = document.createElement('div');
    ring.style.cssText = [
      'position:absolute',
      'inset:0',
      'border-radius:16px',
      'border:2px solid rgba(22,119,255,.9)',
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.5)',
      'pointer-events:none',
    ].join(';');

    lens.append(stage, ring);
    root.append(guard, lens);
    document.documentElement.appendChild(root);

    this.root = root;
    this.lens = lens;
    this.stage = stage;
  }

  /**
   * 把当前页面的 <body> 复制一份放进镜片。
   * 只做一次深拷贝 + 少量清理，之后每帧只改 transform。
   */
  private rebuildClone(): void {
    const stage = this.stage;
    const body = document.body;
    if (!stage || !body) return;

    const started = performance.now();
    const bodyRect = body.getBoundingClientRect();
    this.bodyDocX = bodyRect.left + window.scrollX;
    this.bodyDocY = bodyRect.top + window.scrollY;

    const copy = body.cloneNode(true) as HTMLElement;

    // 脚本/内嵌框架/插件内容复制过来没有意义，还会重复执行或重新加载
    copy.querySelectorAll('script, iframe, noscript, object, embed').forEach((node) => node.remove());
    copy.querySelectorAll('video, audio').forEach((node) => node.removeAttribute('src'));
    // 扩展自己的面板不在 body 内，这里再兜一层，避免把宿主节点也镜像进去
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
      // 显式给高度：否则副本里的 `height:100%` 会相对 auto 高度解析，整块内容纵向错位
      `height:${bodyRect.height}px`,
    ].join(';');

    stage.replaceChildren(copy);
    this.clone = copy;

    // body 自己当滚动容器时，让镜像停在同样的滚动位置
    copy.scrollTop = body.scrollTop;
    copy.scrollLeft = body.scrollLeft;

    this.calibrate();

    this.lastBuild = performance.now();
    this.lastCost = this.lastBuild - started;
    this.dirty = false;
    // 丢弃重建过程中产生的变更记录，避免自己触发自己的刷新
    this.observer?.takeRecords();
    this.position();
  }

  /**
   * 实测副本的排版比例：副本里的 1px 实际渲染成多少页面 px。
   * 正常页面为 1；浏览器缩放、站点 CSS zoom、系统小数显示比例下可能不是 1。
   */
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

  // ---------- 每帧 ----------

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

    this.position();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private position(): void {
    const lens = this.lens;
    const clone = this.clone;
    if (!lens || !clone) return;

    // 镜片跟着鼠标走，贴边时收进视口内
    const left = Math.max(4, Math.min(this.mx - LENS / 2, window.innerWidth - LENS - 4));
    const top = Math.max(4, Math.min(this.my - LENS / 2, window.innerHeight - LENS - 4));
    lens.style.left = `${left}px`;
    lens.style.top = `${top}px`;

    // 鼠标下方那个点在文档坐标系里的位置
    const cursorX = this.mx + window.scrollX;
    const cursorY = this.my + window.scrollY;

    // 换算到副本自己的坐标系（副本 px = 页面 px / cal）
    const localX = (cursorX - this.bodyDocX) / this.calX;
    const localY = (cursorY - this.bodyDocY) / this.calY;

    // 把它映射到「鼠标在镜片里的位置」→ 放大后的画面正好压在原内容上
    const tx = (this.mx - left) / this.calX - localX * this.zoom;
    const ty = (this.my - top) / this.calY - localY * this.zoom;
    clone.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${this.zoom})`;
  }
}
