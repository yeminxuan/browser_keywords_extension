export const panelStyles = `
:host {
  all: initial;
  --ds-text: #1c1f23;
  --ds-sub: #8a9099;
  --ds-border: #e8eaee;
  --ds-accent: #1677ff;
  --ds-danger: #d4380d;
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
  background: #fff;
  color: var(--ds-text);
  border: 1px solid var(--ds-border);
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(15, 18, 24, 0.16), 0 2px 6px rgba(15, 18, 24, 0.06);
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
.ds-icon-btn:hover { background: #f2f4f7; color: var(--ds-text); }

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
  background: #f3f5f8;
}
.ds-tab {
  flex: 1;
  padding: 6px 4px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #606770;
  font-size: 12px;
  cursor: pointer;
}
.ds-tab:hover { color: var(--ds-text); }
.ds-tab.active {
  background: #fff;
  color: var(--ds-text);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(15, 18, 24, 0.1);
}

.ds-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid #d6e4ff;
  border-radius: 10px;
  background: #eef5ff;
  color: #1e5eff;
  font-size: 12px;
}
.ds-status button {
  margin-left: auto;
  flex: none;
  padding: 2px 8px;
  border: 1px solid #b7cfff;
  border-radius: 6px;
  background: #fff;
  color: #1e5eff;
  font-size: 12px;
  cursor: pointer;
}

.ds-new {
  width: 100%;
  padding: 10px;
  border: 1px dashed #cfd4dc;
  border-radius: 10px;
  background: #fafbfc;
  color: #4b5563;
  font-size: 13px;
  cursor: pointer;
}
.ds-new:hover {
  border-color: var(--ds-accent);
  background: #f5f9ff;
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
  color: #a0a6af;
  font-size: 12px;
  text-align: center;
}

.ds-card {
  padding: 10px;
  border: 1px solid #eceef2;
  border-radius: 12px;
  background: #fff;
}
.ds-card.off {
  opacity: 0.55;
  background: #fafafa;
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
  background: #1f2329;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.ds-coords {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #7a808a;
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
  border: 1px solid #e3e6eb;
  border-radius: 7px;
  background: #fff;
  color: #3d434c;
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
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  background: #fff;
  color: var(--ds-text);
  font-size: 12px;
  text-align: center;
}
.ds-card-bottom button {
  padding: 5px 10px;
  border: 1px solid #e3e6eb;
  border-radius: 7px;
  background: #fff;
  color: #3d434c;
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
  border-color: #f0d7cd;
}
.ds-card-bottom button.danger:hover {
  border-color: var(--ds-danger);
  background: #fff7f3;
}

.ds-divider {
  height: 1px;
  margin: 14px 0 6px;
  background: #eef0f3;
}

.ds-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  color: #3d434c;
}
.ds-row input {
  flex: none;
  width: 96px;
  padding: 5px 8px;
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  background: #fff;
  color: var(--ds-text);
  font-size: 13px;
  text-align: center;
}

.ds-panel input:focus {
  outline: none;
  border-color: var(--ds-accent);
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
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
  color: #2b3038;
  font-size: 13px;
  font-weight: 500;
}
.ds-hint {
  color: #9aa0a9;
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
  border: 2px solid #1677ff;
  box-shadow: 0 6px 24px rgba(15, 18, 24, 0.22), 0 2px 6px rgba(15, 18, 24, 0.08);
  pointer-events: none;
  background-color: #fff;
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
`;
