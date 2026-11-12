export const panelStyles = `
:host {
  all: initial;
  color-scheme: light dark;

  /* 语义色板：浅色为默认值，深色在底部媒体查询中覆盖 */
  --ds-text: #1c1f23;
  --ds-sub: #8a9099;
  --ds-muted: #7a808a;
  --ds-hint: #9aa0a9;
  --ds-border: #e8eaee;
  --ds-border-soft: #eceef2;
  --ds-border-input: #dfe3e8;
  --ds-border-chip: #e3e6eb;
  --ds-accent: #1677ff;
  --ds-accent-soft: rgba(22, 119, 255, 0.12);
  --ds-danger: #d4380d;
  --ds-danger-border: #f0d7cd;
  --ds-danger-hover-bg: #fff7f3;
  --ds-bg: #ffffff;
  --ds-bg-sub: #f3f5f8;
  --ds-bg-soft: #fafbfc;
  --ds-bg-hover: #f2f4f7;
  --ds-bg-hover-accent: #f5f9ff;
  --ds-bg-key: #1f2329;
  --ds-text-key: #ffffff;
  --ds-text-strong: #2b3038;
  --ds-text-btn: #3d434c;
  --ds-new-border: #cfd4dc;
  --ds-new-text: #4b5563;
  --ds-tab-text: #606770;
  --ds-status-bg: #eef5ff;
  --ds-status-border: #d6e4ff;
  --ds-status-text: #1e5eff;
  --ds-status-btn-border: #b7cfff;
  --ds-shadow-panel: 0 12px 32px rgba(15, 18, 24, 0.16), 0 2px 6px rgba(15, 18, 24, 0.06);
  --ds-shadow-tab: 0 1px 3px rgba(15, 18, 24, 0.1);

  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ds-text);
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; }

.ds-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}
.ds-overlay.active {
  pointer-events: auto;
  cursor: crosshair;
}

.ds-highlight {
  position: absolute;
  display: none;
  z-index: 2;
  border: 2px solid var(--ds-accent);
  background: rgba(22, 119, 255, 0.08);
  border-radius: 2px;
  pointer-events: none;
}

.ds-tip {
  position: absolute;
  display: none;
  z-index: 3;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(24, 28, 35, 0.92);
  color: #fff;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}

.ds-panel {
  position: absolute;
  display: none;
  z-index: 5;
  width: 344px;
  background: var(--ds-bg);
  color: var(--ds-text);
  border: 1px solid var(--ds-border);
  border-radius: 14px;
  box-shadow: var(--ds-shadow-panel);
  pointer-events: auto;
  overflow: hidden;
}

.ds-hd {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px 11px 14px;
  border-bottom: 1px solid var(--ds-border);
  cursor: grab;
  user-select: none;
}
.ds-hd:active { cursor: grabbing; }
.ds-hd-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}
.ds-hd-sub {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 400;
  color: var(--ds-sub);
}

.ds-icon-btn {
  flex: none;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ds-sub);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}
.ds-icon-btn:hover { background: var(--ds-bg-hover); color: var(--ds-text); }

.ds-body {
  padding: 12px 14px 14px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}

.ds-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
  padding: 4px;
  border-radius: 10px;
  background: var(--ds-bg-sub);
}
.ds-tab {
  flex: 1;
  padding: 6px 4px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--ds-tab-text);
  font-size: 12px;
  cursor: pointer;
}
.ds-tab:hover { color: var(--ds-text); }
.ds-tab.active {
  background: var(--ds-bg);
  color: var(--ds-text);
  font-weight: 600;
  box-shadow: var(--ds-shadow-tab);
}

.ds-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid var(--ds-status-border);
  border-radius: 10px;
  background: var(--ds-status-bg);
  color: var(--ds-status-text);
  font-size: 12px;
}
.ds-status button {
  margin-left: auto;
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--ds-status-btn-border);
  border-radius: 6px;
  background: var(--ds-bg);
  color: var(--ds-status-text);
  font-size: 12px;
  cursor: pointer;
}

.ds-new {
  width: 100%;
  padding: 10px;
  border: 1px dashed var(--ds-new-border);
  border-radius: 10px;
  background: var(--ds-bg-soft);
  color: var(--ds-new-text);
  font-size: 13px;
  cursor: pointer;
}
.ds-new:hover {
  border-color: var(--ds-accent);
  background: var(--ds-bg-hover-accent);
  color: var(--ds-accent);
}

.ds-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}
.ds-empty {
  padding: 10px 2px;
  color: var(--ds-hint);
  font-size: 12px;
  text-align: center;
}

.ds-card {
  padding: 10px;
  border: 1px solid var(--ds-border-soft);
  border-radius: 12px;
  background: var(--ds-bg);
}
.ds-card.off {
  opacity: 0.55;
  background: var(--ds-bg-soft);
}
.ds-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ds-key {
  flex: none;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: var(--ds-bg-key);
  color: var(--ds-text-key);
  font-size: 13px;
  font-weight: 600;
}
.ds-coords {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ds-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.ds-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}
.ds-chips button {
  padding: 4px 8px;
  border: 1px solid var(--ds-border-chip);
  border-radius: 7px;
  background: var(--ds-bg);
  color: var(--ds-text-btn);
  font-size: 12px;
  cursor: pointer;
}
.ds-chips button:hover {
  border-color: var(--ds-accent);
  color: var(--ds-accent);
}

.ds-card-bottom {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.ds-card-bottom input {
  width: 84px;
  padding: 5px 8px;
  border: 1px solid var(--ds-border-input);
  border-radius: 8px;
  background: var(--ds-bg);
  color: var(--ds-text);
  font-size: 12px;
  text-align: center;
}
.ds-card-bottom button {
  padding: 5px 10px;
  border: 1px solid var(--ds-border-chip);
  border-radius: 7px;
  background: var(--ds-bg);
  color: var(--ds-text-btn);
  font-size: 12px;
  cursor: pointer;
}
.ds-card-bottom button:hover {
  border-color: var(--ds-accent);
  color: var(--ds-accent);
}
.ds-card-bottom button.danger {
  margin-left: auto;
  color: var(--ds-danger);
  border-color: var(--ds-danger-border);
}
.ds-card-bottom button.danger:hover {
  border-color: var(--ds-danger);
  background: var(--ds-danger-hover-bg);
}

.ds-divider {
  height: 1px;
  margin: 14px 0 6px;
  background: var(--ds-border-soft);
}

.ds-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  color: var(--ds-text-btn);
}
.ds-row input {
  flex: none;
  width: 96px;
  padding: 5px 8px;
  border: 1px solid var(--ds-border-input);
  border-radius: 8px;
  background: var(--ds-bg);
  color: var(--ds-text);
  font-size: 13px;
  text-align: center;
}

.ds-panel input:focus {
  outline: none;
  border-color: var(--ds-accent);
  box-shadow: 0 0 0 2px var(--ds-accent-soft);
}

.ds-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 0;
  cursor: pointer;
}
.ds-check input {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  accent-color: var(--ds-accent);
  cursor: pointer;
}
.ds-check-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ds-check-text strong {
  color: var(--ds-text-strong);
  font-size: 13px;
  font-weight: 500;
}
.ds-hint {
  color: var(--ds-hint);
  font-size: 11px;
  line-height: 1.5;
}

.ds-toast {
  position: absolute;
  left: 50%;
  bottom: 28px;
  z-index: 6;
  max-width: 70vw;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(24, 28, 35, 0.92);
  color: #fff;
  font-size: 12px;
  opacity: 0;
  transform: translate(-50%, 8px);
  transition: opacity 0.18s ease, transform 0.18s ease;
  pointer-events: none;
}
.ds-toast.show {
  opacity: 1;
  transform: translate(-50%, 0);
}

.ds-magnifier {
  position: absolute;
  display: none;
  border-radius: 6px;
  border: 2px solid var(--ds-accent);
  box-shadow: 0 6px 24px rgba(15, 18, 24, 0.22), 0 2px 6px rgba(15, 18, 24, 0.08);
  pointer-events: none;
  background-color: var(--ds-bg);
  background-repeat: no-repeat;
  overflow: hidden;
}

.ds-lens {
  position: absolute;
  display: none;
  border: 1px solid rgba(22, 119, 255, 0.9);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7), 0 0 12px rgba(22, 119, 255, 0.35);
  background: rgba(22, 119, 255, 0.04);
  pointer-events: none;
}

@media (prefers-color-scheme: dark) {
  :host {
    --ds-text: #e6e9ee;
    --ds-sub: #9aa1aa;
    --ds-muted: #949ba4;
    --ds-hint: #8b939c;
    --ds-border: #2e353d;
    --ds-border-soft: #2b323a;
    --ds-border-input: #3a424b;
    --ds-border-chip: #3a424b;
    --ds-accent: #4c9aff;
    --ds-accent-soft: rgba(76, 154, 255, 0.22);
    --ds-danger: #ff7a5c;
    --ds-danger-border: #5a3a34;
    --ds-danger-hover-bg: #33211d;
    --ds-bg: #1e2228;
    --ds-bg-sub: #262c33;
    --ds-bg-soft: #23282f;
    --ds-bg-hover: #2e353d;
    --ds-bg-hover-accent: #1b2b40;
    --ds-bg-key: #3a424b;
    --ds-text-key: #f2f4f7;
    --ds-text-strong: #d5dae1;
    --ds-text-btn: #c3c9d1;
    --ds-new-border: #3a424b;
    --ds-new-text: #b3bac3;
    --ds-tab-text: #9aa1aa;
    --ds-status-bg: #16263b;
    --ds-status-border: #24405f;
    --ds-status-text: #7db2ff;
    --ds-status-btn-border: #2c4a6b;
    --ds-shadow-panel: 0 12px 32px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.35);
    --ds-shadow-tab: 0 1px 3px rgba(0, 0, 0, 0.4);
  }
}
`;
