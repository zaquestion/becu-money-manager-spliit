// (Palette and shell adapted from becu_mx_amz's lib/panel-style.ts.)
export const STYLE = `
  :host {
    all: initial;
    --bg: #ffffff;
    --fg: #1d2433;
    --muted: #667085;
    --border: #e4e7ec;
    --subtle: #f5f6f8;
    --accent: #007c89;
    --accent-hover: #006570;
    --accent-fg: #ffffff;
    --ok: #137333;
    --ok-bg: #e7f4ea;
    --warn: #8a5300;
    --warn-bg: #fff4dd;
    --danger: #b42318;
    --danger-bg: #fdecea;
    --focus: #2f7de1;
    --shadow: 0 8px 32px rgba(16, 24, 40, .24), 0 2px 6px rgba(16, 24, 40, .12);
    font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--fg);
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --bg: #1c1f26;
      --fg: #e6e8ec;
      --muted: #9aa3b2;
      --border: #343a46;
      --subtle: #252a33;
      --accent: #3fb3c0;
      --accent-hover: #5cc4cf;
      --accent-fg: #0d1117;
      --ok: #6fcf8a;
      --ok-bg: #1d3325;
      --warn: #f0b95b;
      --warn-bg: #3a2e17;
      --danger: #f28b82;
      --danger-bg: #3b1f1d;
      --focus: #79b0ff;
      --shadow: 0 8px 32px rgba(0, 0, 0, .55);
    }
  }

  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  button, select, input, textarea { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

  .panel {
    position: fixed; right: 12px; bottom: 12px; z-index: 2147483647;
    width: min(480px, calc(100vw - 24px)); max-height: calc(100vh - 24px);
    display: flex; flex-direction: column;
    background: var(--bg); color: var(--fg);
    border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow);
    overflow: hidden;
  }
  header {
    display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 16px;
    border-bottom: 1px solid var(--border);
  }
  h2 { margin: 0; font-size: 15px; font-weight: 650; }
  .spacer { flex: 1; }
  .icon {
    width: 28px; height: 28px; display: grid; place-items: center;
    border: 0; border-radius: 6px; background: transparent; color: var(--muted);
    font-size: 18px; line-height: 1; cursor: pointer;
  }
  .icon:hover { background: var(--subtle); color: var(--fg); }
  .content { overflow: auto; padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
  .tx { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 12px; padding: 8px 10px; border-radius: 8px; background: var(--subtle); }
  .tx .payee { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tx .amount { font-weight: 650; font-variant-numeric: tabular-nums; text-align: right; }
  .tx .sub { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .muted { color: var(--muted); font-size: 12px; }
  .muted.rule { margin-top: 2px; }

  .callout { margin: 0; padding: 8px 10px; border-radius: 6px; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
  .callout.warn { background: var(--warn-bg); color: var(--warn); }
  .callout.danger { background: var(--danger-bg); color: var(--danger); }
  .callout.ok { background: var(--ok-bg); color: var(--ok); }
  .callout a { color: inherit; font-weight: 650; }

  .grid { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 8px 10px; align-items: center; }
  .grid > label { color: var(--muted); font-size: 12px; }
  .pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
  input[type="text"], input[type="date"], input[type="url"], select, textarea {
    width: 100%; min-height: 30px; padding: 4px 8px;
    border: 1px solid var(--border); border-radius: 6px; background: var(--bg);
  }
  textarea { min-height: 52px; resize: vertical; }
  input.num { text-align: right; font-variant-numeric: tabular-nums; }

  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  td { padding: 3px 6px 3px 0; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  td.check { width: 24px; }
  td.value { width: 90px; }
  td.share { width: 80px; text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
  tr.off td:not(.check) { opacity: .45; }
  .items { max-height: 240px; overflow: auto; border: 1px solid var(--border); border-radius: 8px; padding: 2px 4px 2px 8px; }
  td.date { width: 52px; white-space: nowrap; color: var(--muted); }
  td.payee { max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  td.status { width: 74px; white-space: nowrap; color: var(--muted); }
  td.status a { color: var(--ok); font-weight: 600; text-decoration: none; }

  .option { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); cursor: pointer; }
  .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .actions .note { flex: 1; min-width: 160px; font-size: 12px; color: var(--muted); }
  .actions .note.error { color: var(--danger); }
  .btn {
    min-height: 30px; padding: 4px 14px; font-size: 12px; border-radius: 6px; cursor: pointer; font-weight: 600;
    border: 1px solid var(--border); background: var(--bg);
  }
  .btn:hover:not(:disabled) { background: var(--subtle); }
  .btn:disabled { opacity: .5; cursor: default; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  .btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
  .link { border: 0; background: none; padding: 0; color: var(--accent); cursor: pointer; font-size: 12px; font-weight: 600; text-decoration: none; }
`;
