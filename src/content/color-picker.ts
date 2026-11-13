/**
 * 快捷键取色器（截图方案）
 *
 * 流程：按快捷键 → background 对当前视口截图 → 镜片跟随鼠标，
 * 用 drawImage 把鼠标周围区域放大画到 canvas 上，中心十字准星对准的那个像素就是待取颜色。
 *
 *   - `+` / `-`：实时调整放大倍数（关闭平滑，像素级精确）
 *   - 左键：复制中心像素的 HEX 并关闭；右键 / Esc：取消
 *   - 取色期间锁定滚动，保证截图坐标和视口坐标始终对齐
 *
 * 注意：画面是激活瞬间的冻结截图，之后页面发生的变化不会反映进来。
 */

const LENS = 200; // 镜片边长（CSS px）
const ZOOM_MIN = 2;
const ZOOM_MAX = 24;

export interface ColorPickerOptions {
  /** 成功复制颜色后回调（用于 toast 提示） */
  onPick?: (hex: string) => void;
  /** 倍数变化时回调（用于持久化默认倍数） */
  onZoomChange?: (zoom: number) => void;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // 剪贴板 API 不可用时退回到 execCommand
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.documentElement.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export class ColorPicker {
  private root: HTMLDivElement | null = null;
  private lens: HTMLDivElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private hexEl: HTMLDivElement | null = null;
  private rgbEl: HTMLDivElement | null = null;
  private swatchEl: HTMLSpanElement | null = null;
  private zoomEl: HTMLSpanElement | null = null;

  /** 原始截图的离屏 canvas，用于 1px 采样 */
  private sampleCanvas: HTMLCanvasElement | null = null;
  private sampleCtx: CanvasRenderingContext2D | null = null;
  private scaleX = 1;
  private scaleY = 1;

  private attached = false;
  private mx = -1;
  private my = -1;
  private zoom = 6;
  private hex = '#000000';

  private readonly options: ColorPickerOptions;

  constructor(options: ColorPickerOptions = {}) {
    this.options = options;
  }

  get isOpen(): boolean {
    return this.attached;
  }

  /**
   * 打开取色器。截图失败会抛错，由调用方 toast。
   * @param zoom 初始放大倍数
   * @param initial 初始镜片位置（视口坐标），缺省为视口中心
   */
  async open(zoom: number, initial?: { x: number; y: number }): Promise<void> {
    if (this.attached) return;

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
    if (!sampleCtx) throw new Error('无法创建取色画布');
    sampleCtx.drawImage(image, 0, 0);

    this.sampleCanvas = sampleCanvas;
    this.sampleCtx = sampleCtx;
    this.scaleX = image.naturalWidth / Math.max(1, window.innerWidth);
    this.scaleY = image.naturalHeight / Math.max(1, window.innerHeight);
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom)));

    this.mx = initial?.x ?? Math.round(window.innerWidth / 2);
    this.my = initial?.y ?? Math.round(window.innerHeight / 2);

    this.build();
    this.attached = true;

    window.addEventListener('pointermove', this.onMove, true);
    window.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('mousedown', this.onSuppress, true);
    window.addEventListener('mouseup', this.onSuppress, true);
    window.addEventListener('click', this.onSuppress, true);
    window.addEventListener('contextmenu', this.onContextMenu, true);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    window.addEventListener('touchmove', this.onWheel, { capture: true, passive: false });

    this.render();
  }

  close(): void {
    if (!this.attached) return;
    this.attached = false;

    window.removeEventListener('pointermove', this.onMove, true);
    window.removeEventListener('pointerdown', this.onPointerDown, true);
    window.removeEventListener('mousedown', this.onSuppress, true);
    window.removeEventListener('mouseup', this.onSuppress, true);
    window.removeEventListener('click', this.onSuppress, true);
    window.removeEventListener('contextmenu', this.onContextMenu, true);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('wheel', this.onWheel, true);
    window.removeEventListener('touchmove', this.onWheel, true);

    this.root?.remove();
    this.root = null;
    this.lens = null;
    this.ctx = null;
    this.hexEl = null;
    this.rgbEl = null;
    this.swatchEl = null;
    this.zoomEl = null;
    this.sampleCanvas = null;
    this.sampleCtx = null;
  }

  destroy(): void {
    this.close();
  }

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

    const lens = document.createElement('div');
    lens.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'border-radius:12px',
      'overflow:hidden',
      'border:2px solid rgba(22,119,255,.9)',
      'box-shadow:0 10px 30px rgba(15,23,42,.35)',
      'background:#fff',
    ].join(';');

    const canvas = document.createElement('canvas');
    canvas.width = LENS;
    canvas.height = LENS;
    canvas.style.cssText = `display:block;width:${LENS}px;height:${LENS}px;`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const info = document.createElement('div');
    info.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:8px 10px',
      'background:rgba(15,23,42,.92)',
      'color:#fff',
      'font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'user-select:none',
    ].join(';');

    const swatch = document.createElement('span');
    swatch.style.cssText = 'width:18px;height:18px;border-radius:4px;border:1px solid rgba(255,255,255,.4);flex:none;';

    const textWrap = document.createElement('div');
    const hexEl = document.createElement('div');
    hexEl.style.cssText = 'font-weight:600;letter-spacing:.5px;';
    const rgbEl = document.createElement('div');
    rgbEl.style.cssText = 'opacity:.75;font-size:11px;';
    textWrap.append(hexEl, rgbEl);

    const zoomEl = document.createElement('span');
    zoomEl.style.cssText = 'margin-left:auto;opacity:.75;flex:none;';

    info.append(swatch, textWrap, zoomEl);
    lens.append(canvas, info);
    root.appendChild(lens);
    document.documentElement.appendChild(root);

    this.root = root;
    this.lens = lens;
    this.ctx = ctx;
    this.hexEl = hexEl;
    this.rgbEl = rgbEl;
    this.swatchEl = swatch;
    this.zoomEl = zoomEl;
  }

  // ---------- 事件 ----------

  private onMove = (event: PointerEvent): void => {
    this.mx = event.clientX;
    this.my = event.clientY;
    this.render();
  };

  private onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 2) {
      this.close();
      return;
    }
    if (event.button !== 0) return;
    this.mx = event.clientX;
    this.my = event.clientY;
    this.sample();
    const hex = this.hex;
    void copyText(hex).then(() => {
      this.options.onPick?.(hex);
    });
    this.close();
  };

  private onSuppress = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  private onWheel = (event: Event): void => {
    // 取色期间禁止滚动：截图是冻结的，滚动后坐标就对不上了
    event.preventDefault();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      event.stopPropagation();
      this.setZoom(this.zoom + 1);
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      event.stopPropagation();
      this.setZoom(this.zoom - 1);
    }
  };

  private setZoom(value: number): void {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
    if (next === this.zoom) return;
    this.zoom = next;
    this.options.onZoomChange?.(next);
    this.render();
  }

  // ---------- 渲染与采样 ----------

  private sample(): void {
    const sampleCanvas = this.sampleCanvas;
    const sampleCtx = this.sampleCtx;
    if (!sampleCanvas || !sampleCtx) return;
    const px = Math.min(sampleCanvas.width - 1, Math.max(0, Math.floor(this.mx * this.scaleX)));
    const py = Math.min(sampleCanvas.height - 1, Math.max(0, Math.floor(this.my * this.scaleY)));
    const [r, g, b] = sampleCtx.getImageData(px, py, 1, 1).data;
    this.hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    if (this.hexEl) this.hexEl.textContent = this.hex;
    if (this.rgbEl) this.rgbEl.textContent = `rgb(${r}, ${g}, ${b})`;
    if (this.swatchEl) this.swatchEl.style.background = this.hex;
  }

  private render(): void {
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

    // 中心像素框 + 十字准星（黑白双色描边，深浅背景都可见）
    const center = LENS / 2;
    const half = this.zoom / 2;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.strokeRect(center - half - 1.5, center - half - 1.5, this.zoom + 3, this.zoom + 3);
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.strokeRect(center - half - 0.5, center - half - 0.5, this.zoom + 1, this.zoom + 1);

    ctx.beginPath();
    ctx.moveTo(0, center + 0.5);
    ctx.lineTo(center - half - 3, center + 0.5);
    ctx.moveTo(center + half + 3, center + 0.5);
    ctx.lineTo(LENS, center + 0.5);
    ctx.moveTo(center + 0.5, 0);
    ctx.lineTo(center + 0.5, center - half - 3);
    ctx.moveTo(center + 0.5, center + half + 3);
    ctx.lineTo(center + 0.5, LENS);
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.stroke();

    if (this.zoomEl) this.zoomEl.textContent = `${this.zoom}×`;
    this.sample();
  }
}
