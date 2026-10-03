/** Estilo do Game Editor (injetado pelo próprio editor; só existe no modo dev). */
export const EDITOR_CSS = `
/* Game Editor (F10, só dev) — mesma pele das janelas do HUD, um pouco maior e mais densa. */
.ge-win {
  position: fixed; left: 50%; top: 28px; transform: translateX(-50%); z-index: 50;
  width: 940px; max-width: calc(100vw - 16px); height: calc(100vh - 56px);
  display: flex; flex-direction: column;
  background: linear-gradient(180deg, rgba(232, 237, 247, 0.97), rgba(208, 217, 234, 0.97));
  border: 1px solid #5f6f96; border-radius: 4px; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  font: 11px Tahoma, Verdana, 'Segoe UI', sans-serif; color: #1d2540; pointer-events: auto; user-select: text;
}
.ge-win[hidden] { display: none; }
.ge-title {
  display: flex; align-items: center; gap: 8px; height: 22px; padding: 0 6px 0 10px;
  background: linear-gradient(180deg, #4f8a7a, #2d5a4e); color: #fff; font-weight: bold; letter-spacing: 1px;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);
}
.ge-dev { padding: 0 4px; border-radius: 2px; background: #ffcf4a; color: #3a2400; font-size: 9px; letter-spacing: 0; text-shadow: none; }
.ge-x { margin-left: auto; width: 18px; height: 16px; border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 2px; background: rgba(0, 0, 0, 0.15); color: #fff; cursor: pointer; line-height: 12px; }
.ge-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid rgba(95, 111, 150, 0.35); }
.ge-btn {
  padding: 2px 8px; font: inherit; color: #1d2540; cursor: pointer;
  background: linear-gradient(180deg, #fbfcff, #d4dbea); border: 1px solid #8391b5; border-radius: 3px;
}
.ge-btn:hover:not(:disabled) { background: linear-gradient(180deg, #fff, #e3e9f5); }
.ge-btn:disabled { opacity: 0.45; cursor: default; }
.ge-primary { background: linear-gradient(180deg, #8fd6b0, #4e9e78); color: #08281a; border-color: #3d7a5c; font-weight: bold; }
.ge-danger { color: #8a1f14; }
.ge-mini { padding: 0 5px; }
.ge-sep { width: 1px; height: 16px; background: rgba(95, 111, 150, 0.4); margin: 0 3px; }
.ge-status { margin-left: auto; color: #4a5577; font-style: italic; }
.ge-status.ge-err { color: #b0281a; font-style: normal; font-weight: bold; }
.ge-tabs { display: flex; gap: 2px; padding: 6px 8px 0; border-bottom: 1px solid #8391b5; }
.ge-tab {
  padding: 4px 12px; font: inherit; font-weight: bold; color: #4a5577; cursor: pointer;
  background: rgba(255, 255, 255, 0.45); border: 1px solid #8391b5; border-bottom: none; border-radius: 4px 4px 0 0;
}
.ge-tab.on { background: #f4f7fd; color: #1d2540; position: relative; top: 1px; }
.ge-hint { padding: 4px 10px; color: #4a5577; font-size: 10px; background: rgba(255, 255, 255, 0.35); }
.ge-body { flex: 1; overflow-y: auto; padding: 4px 10px 14px; background: rgba(244, 247, 253, 0.85); }
.ge-sec { border-top: 1px solid rgba(95, 111, 150, 0.3); padding: 8px 0 4px; }
.ge-sec:first-child { border-top: 0; }
.ge-sec h4 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.7px; color: #2d5a4e; }
.ge-note { color: #5a6688; font-size: 10px; margin: 0 0 5px; }
.ge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 3px 14px; margin: 2px 0 4px; }
.ge-field { display: flex; align-items: center; gap: 6px; min-height: 20px; }
.ge-lab { flex: 1; color: #2c3554; }
.ge-extra { color: #6a7596; font-size: 10px; min-width: 34px; }
.ge-num { width: 70px; padding: 1px 3px; font: inherit; border: 1px solid #9aa6c4; border-radius: 2px; background: #fff; text-align: right; }
.ge-sel { font: inherit; padding: 0 2px; border: 1px solid #9aa6c4; border-radius: 2px; background: #fff; max-width: 190px; }
.ge-num.chg, .ge-sel.chg { background: #fff3c4; border-color: #c9a24a; font-weight: bold; }
table.chg { outline: 2px solid #e8c766; }
.ge-arr { display: inline-flex; flex-wrap: wrap; gap: 2px; }
.ge-table { border-collapse: collapse; margin: 2px 0 6px; }
.ge-table th { text-align: left; font-weight: bold; color: #4a5577; padding: 2px 6px 2px 0; border-bottom: 1px solid rgba(95, 111, 150, 0.35); white-space: nowrap; }
.ge-table td { padding: 2px 6px 2px 0; vertical-align: middle; }
.ge-table tbody tr:nth-child(even) { background: rgba(127, 147, 196, 0.08); }
.ge-ro { color: #2d5a4e; font-weight: bold; }
.ge-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin: 3px 0; }
.ge-inline .ge-field { min-height: 0; }
.ge-inline .ge-lab { flex: none; }
.ge-inline-t { min-width: 170px; }
.ge-det { margin: 2px 0 4px; padding: 2px 0 2px 10px; border-left: 2px solid rgba(79, 138, 122, 0.35); }
.ge-det > summary { cursor: pointer; font-weight: bold; color: #2c3554; padding: 1px 0; }
`;
