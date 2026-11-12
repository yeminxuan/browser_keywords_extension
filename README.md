简体中文 | [English](README.en.md)

# browser_keywords_extension

一个快捷键驱动的 Chrome 扩展：把「拖拽 / 点击 / 放大查看」这些重复动作绑定到单个按键上，按一下就能复现。所有配置按标签页独立保存，后续还会继续补充更多快捷功能。

## 功能

### 拖拽点击
录制按键 → 拾取起点 → 拾取终点，之后按该键自动重放一次鼠标拖拽（带缓动，可在设置里调时长、按下停顿、移动步数）。也支持「起点 = 当前鼠标」，即从鼠标所在位置拖到固定终点。

### 定点点击
录制按键 → 拾取位置，按该键在指定坐标点击一次。

### 区域点击
录制按键 → 框选一片区域，按该键按设定间距（默认 5px）在区域内逐点点击，适合批量点破气球、清空列表之类的高频操作。可调网格间距与点击间隔。

### 放大镜
录制按键（例如 Q）→ 按一下开启，再按一下（或 ESC）关闭。开启后一个 180×180 的镜片跟随鼠标，以鼠标为中心实时放大下方页面内容，倍数可在面板中调节（1.2 – 6，默认 2.4）。

- 实现方式是 DOM 镜像 + `transform` 缩放，每帧只做位移/缩放，60fps 跟手，不依赖截图权限。
- 页面 DOM 变化后会自动重建镜像；CSS 动画实时播放。
- 已知边界：`<canvas>`、`<video>` 里的画面不会被复刻。

### 高兼容模式
默认用页面内模拟事件，兼容大多数组件；遇到拖不动（原生 `draggable`）、点击无响应（文件、游戏等）时，打开「高兼容模式」，改由 `chrome.debugger` 派发真实输入事件。注意：该模式需要扩展的调试权限，且被调试的页面不能同时开着 DevTools。

## 安装

```bash
npm install
npm run build
```

然后打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择项目下的 `dist` 目录。点击工具栏上的扩展图标即可打开配置面板。

## 使用

1. 打开面板，选择功能 tab（拖拽点击 / 区域点击 / 定点点击 / 放大镜）。
2. 点「＋ 新建…」，按提示录制按键、拾取坐标或框选区域。
3. 在页面上按对应按键即可执行；面板里可随时改键、改坐标、停用或删除。
4. 「全部启用」关闭后所有快捷键暂停响应；面板可拖动到任意位置，位置会记在本标签页。

## 开发

```bash
npm run dev        # 监听构建 content script
npm run typecheck  # 类型检查
npm run build      # 构建到 dist/
```

产物说明：`dist/manifest.json`、`dist/content.js`（页面内脚本）、`dist/background.js`（Service Worker）。

## 测试页

项目根目录的 `test-page.html` 是一个功能测试页：方块可以拖进垃圾桶，泡泡可以用区域点击批量点破，也可以在这里验证放大镜。

请不要用 `file://` 直接打开（content script 不会注入本地文件页面），用本地静态服务器访问即可，例如：

```bash
python3 -m http.server 8080
# 然后访问 http://localhost:8080/test-page.html
```

## 目录结构

```
public/manifest.json   扩展清单
src/background/        Service Worker：tabId / 存储读取、CDP 拖拽与点击
src/content/           内容脚本：面板 UI、快捷键录制、坐标拾取、执行逻辑
src/content/magnifier.ts   放大镜（DOM 镜像 + transform）
src/content/drag.ts        页面内模拟拖拽/点击
src/types.ts           共享类型与默认设置
```
