/** CSS do editor de mapas (janela DEV, azul-marinho + dourado do Vanguarda). */
export const MAP_EDITOR_CSS = `
.me-win { position: fixed; inset: 0; z-index: 1200; display: flex; flex-direction: column;
  background: #0d1420; color: #e8e2d0; font: 13px/1.45 system-ui, sans-serif; }
.me-win[hidden] { display: none; }
.me-top { display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  background: linear-gradient(#1b2740, #131c30); border-bottom: 2px solid #c9a227; flex: none; flex-wrap: wrap; }
.me-title { font-weight: 700; color: #ffd75e; margin-right: 8px; white-space: nowrap; }
.me-dev { font-size: 10px; background: #7a2e2e; border-radius: 3px; padding: 1px 5px; margin-left: 6px; vertical-align: middle; }
.me-btn { background: #22314f; color: #e8e2d0; border: 1px solid #3a4c72; border-radius: 4px;
  padding: 4px 10px; cursor: pointer; white-space: nowrap; }
.me-btn:hover:not(:disabled) { background: #2c3f66; border-color: #c9a227; }
.me-btn:disabled { opacity: 0.4; cursor: default; }
.me-btn.on { background: #4a3a10; border-color: #ffd75e; color: #ffd75e; }
.me-btn.primary { background: #4a3a10; border-color: #c9a227; color: #ffd75e; font-weight: 700; }
.me-sep { width: 1px; height: 20px; background: #3a4c72; margin: 0 4px; flex: none; }
.me-status-mini { margin-left: auto; font-size: 12px; color: #9fb0c9; white-space: nowrap; }
.me-status-mini.dirty { color: #ffb347; }
.me-body { display: flex; flex: 1; min-height: 0; }
.me-left { width: 148px; flex: none; background: #111a2b; border-right: 1px solid #2a3a58;
  padding: 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.me-left h4, .me-right h4 { margin: 6px 0 4px; font-size: 11px; text-transform: uppercase; color: #c9a227; letter-spacing: 0.06em; }
.me-center { flex: 1; min-width: 0; position: relative; background: #10141c; }
.me-canvas { position: absolute; inset: 0; cursor: crosshair; display: block; }
.me-right { width: 264px; flex: none; background: #111a2b; border-left: 1px solid #2a3a58;
  display: flex; flex-direction: column; min-height: 0; }
.me-tabs { display: flex; flex: none; border-bottom: 1px solid #2a3a58; }
.me-tab { flex: 1; background: none; border: none; color: #9fb0c9; padding: 7px 2px; cursor: pointer; font-size: 12px; }
.me-tab.on { color: #ffd75e; border-bottom: 2px solid #ffd75e; }
.me-panel { padding: 8px; overflow-y: auto; flex: 1; min-height: 0; }
.me-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.me-row label { width: 86px; flex: none; color: #9fb0c9; font-size: 12px; }
.me-row input, .me-row select { flex: 1; min-width: 0; background: #0d1420; color: #e8e2d0;
  border: 1px solid #3a4c72; border-radius: 4px; padding: 3px 6px; }
.me-pal { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.me-swatch { border: 1px solid #3a4c72; border-radius: 4px; padding: 4px 2px; cursor: pointer;
  text-align: center; font-size: 11px; background: #0d1420; }
.me-swatch:hover { border-color: #c9a227; }
.me-swatch.on { border-color: #ffd75e; box-shadow: 0 0 0 1px #ffd75e; }
.me-swatch canvas { display: block; width: 30px; height: 30px; margin: 0 auto 2px; border-radius: 3px; image-rendering: auto; }
.me-layer { display: flex; align-items: center; gap: 6px; padding: 4px 2px; border-bottom: 1px solid #1b2740; font-size: 12px; }
.me-layer input[type=checkbox] { accent-color: #c9a227; }
.me-bottom { flex: none; display: flex; gap: 14px; align-items: center; padding: 4px 10px;
  background: #111a2b; border-top: 1px solid #2a3a58; font-size: 12px; color: #9fb0c9; font-family: monospace; }
.me-bottom .err { color: #ff6b60; }
.me-bottom .warn { color: #ffb347; }
.me-bottom .okv { color: #30d158; }
.me-obj { border: 1px solid #2a3a58; border-radius: 4px; padding: 4px 6px; margin-bottom: 4px; font-size: 12px; }
.me-obj.sel { border-color: #ffd75e; }
.me-obj button { float: right; }
.me-kbd { font-family: monospace; background: #0d1420; border: 1px solid #3a4c72; border-radius: 3px; padding: 0 4px; font-size: 11px; }
`;
