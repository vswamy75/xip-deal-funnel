// Builds the XIP Deal Funnel dashboard — "Utility Locate" visual system.
// Usage: node build-interactive-dashboard.js <workbookPath> <outputHtmlPath>
const fs = require("fs");
const XLSX = require("xlsx");
const { SHEET_NAME } = require("./schema");

function readRows(workbookPath) {
  const wb = XLSX.readFile(workbookPath);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const TIER_ORDER = ["Strong Fit", "Fit", "Marginal", "Pass"];

// Which underground-utility locate color a deal's End-Market earns.
// Real APWA code: red=electric, orange=communications, green=sewer/waste lines.
// Transportation, water, and anything else outside XIP's core three verticals
// reads as an unmarked, neutral flag rather than forcing a color that isn't real.
function flagFor(endMarket) {
  const m = (endMarket || "").toLowerCase();
  if (m.includes("consumer")) return "none";
  if (m.includes("energy") || m.includes("electric") || m.includes("power")) return "energy";
  if (m.includes("telecom") || m.includes("communicat")) return "telecom";
  if (m.includes("waste") || m.includes("sewer") || m.includes("sanitation")) return "waste";
  return "other";
}

const FLAG_LABEL = {
  energy: "Electric / Energy",
  telecom: "Communications",
  waste: "Waste Management",
  other: "Unmarked (Water / Transportation / Other)",
  none: "Outside XIP's Right-of-Way (Consumer)",
};

function flagPinHtml(flagKey) {
  if (flagKey === "none") return `<span class="locate-flag flag-none" title="${esc(FLAG_LABEL[flagKey])}"><span class="pole"></span></span>`;
  return `<span class="locate-flag flag-${flagKey}" title="${esc(FLAG_LABEL[flagKey])}"><span class="pole"></span><span class="pennant"></span></span>`;
}

function stampHtml(tier, score) {
  const cls = "stamp-" + String(tier).toLowerCase().replace(/\s+/g, "-");
  const glyph = tier === "Strong Fit" ? "&#10003;" : tier === "Pass" ? "&#10005;" : "&#9679;";
  return `<span class="stamp ${cls}"><span class="stamp-glyph">${glyph}</span>${esc(tier)}<span class="stamp-score">${score}</span></span>`;
}

function build(workbookPath, outputHtmlPath) {
  const rawRows = readRows(workbookPath);

  const deals = rawRows.map((r) => ({
    id: r["Deal ID"] || "",
    dateReceived: r["Date Received"] || "",
    subject: r["Subject"] || "",
    sender: r["Sender"] || "",
    sourceQuality: r["Source Quality"] || "Unknown",
    targetCompany: r["Target Company"] || "",
    endMarket: r["End-Market"] || "Unknown",
    geography: r["Geography"] || "Unknown",
    ebitda: r["EBITDA"] || "",
    revenue: r["Revenue"] || "",
    ebitdaMargin: r["EBITDA Margin"] || "",
    askingPrice: r["Asking Price / EV"] || "Unknown",
    businessModel: r["Business Model"] || "Unknown",
    managementQuality: r["Management Quality"] || "Unknown",
    peOwned: r["PE-Owned"] || "Unknown",
    brokerPlatform: r["Broker / Platform"] || "Unknown",
    processNotes: r["Process Notes"] || "",
    fitScore: Number(r["Fit Score"]) || 0,
    fitTier: r["Fit Tier"] || "Unknown",
    aiRationale: r["AI Rationale"] || "",
    attachments: r["Attachments"] || "N",
    emailLink: r["Email Link"] || "",
    status: r["Status"] || "New",
  }));

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const parsed = (d) => {
    const dt = new Date(d);
    return isNaN(dt) ? null : dt;
  };

  const totalScreened = deals.length;
  const newLast7 = deals.filter((d) => {
    const dt = parsed(d.dateReceived);
    return dt && dt >= sevenDaysAgo;
  }).length;
  const tierCounts = TIER_ORDER.reduce((acc, t) => {
    acc[t] = deals.filter((d) => d.fitTier === t).length;
    return acc;
  }, {});
  const strongFit = tierCounts["Strong Fit"] || 0;
  const fit = tierCounts["Fit"] || 0;
  const needsReview = deals.filter((d) =>
    [d.targetCompany, d.endMarket, d.ebitda, d.businessModel, d.managementQuality, d.sourceQuality, d.geography, d.brokerPlatform].some(
      (v) => !v || v === "Unknown"
    )
  ).length;

  const tierTotal = TIER_ORDER.reduce((s, t) => s + (tierCounts[t] || 0), 0) || 1;

  const flagCounts = new Map();
  for (const d of deals) {
    const f = flagFor(d.endMarket);
    flagCounts.set(f, (flagCounts.get(f) || 0) + 1);
  }
  const flagOrder = ["energy", "telecom", "waste", "other", "none"];
  const flagMax = Math.max(1, ...flagOrder.map((f) => flagCounts.get(f) || 0));

  const sourceCounts = new Map();
  for (const d of deals) {
    const k = d.sourceQuality || "Unknown";
    sourceCounts.set(k, (sourceCounts.get(k) || 0) + 1);
  }
  const sourceOrder = ["Off-market", "Bulge-bracket/Mid-market Bank", "Business Broker", "Unknown"];
  const sourceRows = sourceOrder.map((label) => [label, sourceCounts.get(label) || 0]);
  const sourceMax = Math.max(1, ...sourceRows.map(([, c]) => c));

  // Week-over-week trend on the "New / 7 Days" KPI
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const prevWeekCount = deals.filter((d) => {
    const dt = parsed(d.dateReceived);
    return dt && dt >= fourteenDaysAgo && dt < sevenDaysAgo;
  }).length;
  const weekDelta = newLast7 - prevWeekCount;
  const weekDeltaClass = weekDelta > 0 ? "up" : weekDelta < 0 ? "down" : "flat";
  const weekDeltaSign = weekDelta > 0 ? "+" : "";
  const weekDeltaHtml = `<div class="k-delta ${weekDeltaClass}">${weekDeltaSign}${weekDelta} vs prior wk</div>`;

  // Deal Quality Funnel: cumulative "at least this tier" gates, each a subset of the previous.
  function trapClip(topPct, botPct) {
    const t = Math.max(0, Math.min(100, topPct));
    const b = Math.max(0, Math.min(100, botPct));
    const tL = (100 - t) / 2, tR = 100 - tL;
    const bL = (100 - b) / 2, bR = 100 - bL;
    return `polygon(${tL.toFixed(2)}% 0%, ${tR.toFixed(2)}% 0%, ${bR.toFixed(2)}% 100%, ${bL.toFixed(2)}% 100%)`;
  }
  const atLeastMarginal = totalScreened - (tierCounts["Pass"] || 0);
  const atLeastFit = fit + strongFit;
  const funnelDenom = Math.max(1, totalScreened);
  const pctOf = (n) => (totalScreened ? Math.round((n / funnelDenom) * 100) : 0);
  const pctMarginal = (atLeastMarginal / funnelDenom) * 100;
  const pctFit = (atLeastFit / funnelDenom) * 100;
  const pctStrong = (strongFit / funnelDenom) * 100;

  const funnelHtml = totalScreened === 0
    ? `<div class="funnel-empty">No deals screened yet &mdash; the funnel will populate as deals are logged.</div>`
    : `<div class="funnel-chart">
      <div class="funnel-cap"><span class="funnel-cap-label">Screened</span><span class="funnel-cap-count mono">${totalScreened}</span></div>
      <div class="funnel-seg funnel-seg-marginal">
        <div class="funnel-seg-shape" style="clip-path:${trapClip(100, pctMarginal)}" aria-hidden="true"></div>
        <div class="funnel-label"><span class="funnel-label-pill">At Least Marginal <b class="mono">${atLeastMarginal}</b><small>${pctOf(atLeastMarginal)}%</small></span></div>
      </div>
      <div class="funnel-seg funnel-seg-fit">
        <div class="funnel-seg-shape" style="clip-path:${trapClip(pctMarginal, pctFit)}" aria-hidden="true"></div>
        <div class="funnel-label"><span class="funnel-label-pill">At Least Fit <b class="mono">${atLeastFit}</b><small>${pctOf(atLeastFit)}%</small></span></div>
      </div>
      <div class="funnel-seg funnel-seg-strong">
        <div class="funnel-seg-shape" style="clip-path:${trapClip(pctFit, pctStrong)}" aria-hidden="true"></div>
        <div class="funnel-label"><span class="funnel-label-pill">Strong Fit <b class="mono">${strongFit}</b><small>${pctOf(strongFit)}%</small></span></div>
      </div>
    </div>
    <div class="funnel-drops">
      <div class="funnel-drop"><span>Pass (didn&rsquo;t clear gate)</span><span class="mono">${tierCounts["Pass"] || 0}</span></div>
      <div class="funnel-drop"><span>Capped at Marginal</span><span class="mono">${tierCounts["Marginal"] || 0}</span></div>
      <div class="funnel-drop"><span>Capped at Fit</span><span class="mono">${tierCounts["Fit"] || 0}</span></div>
    </div>`;

  const dealsForJs = deals.map((d) => ({ ...d, flag: flagFor(d.endMarket) }));
  const dataJson = JSON.stringify(dealsForJs).replace(/</g, "\\u003c");

  const tierBarSegments = TIER_ORDER.map((t) => {
    const c = tierCounts[t] || 0;
    const pctW = (c / tierTotal) * 100;
    return `<div class="tier-seg tier-${t.toLowerCase().replace(/\s+/g, "-")}" style="width:${pctW}%" title="${t}: ${c}"></div>`;
  }).join("");

  const tierLegend = TIER_ORDER.map(
    (t) => `<div class="tier-legend-item">${stampHtml(t, "")}<span class="tier-legend-count">${tierCounts[t] || 0}</span></div>`
  ).join("");

  const legendRows = flagOrder
    .map((f) => {
      const count = flagCounts.get(f) || 0;
      const w = (count / flagMax) * 100;
      return `<div class="legend-row">
        <div class="legend-top">${flagPinHtml(f)}<div class="legend-label">${esc(FLAG_LABEL[f])}</div><div class="legend-count">${count}</div></div>
        <div class="bar-track" aria-hidden="true"><div class="bar-fill flag-fill-${f}" style="width:${w}%"></div></div>
      </div>`;
    })
    .join("");

  const sourceBarRows = sourceRows
    .map(([label, count]) => {
      const w = (count / sourceMax) * 100;
      return `<div class="legend-row">
        <div class="legend-top"><div class="legend-label">${esc(label)}</div><div class="legend-count">${count}</div></div>
        <div class="bar-track" aria-hidden="true"><div class="bar-fill source-fill" style="width:${w}%"></div></div>
      </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>XIP Deal Funnel</title>
<style>
  :root {
    --page: #FFFFFF;
    --surface: #FFFFFF;
    --surface-2: #F2F3F3;
    --ink: #14181C;
    --ink-2: #4B4F55;
    --muted: #7C8086;
    --hairline: #DCDFDE;
    --ring: rgba(20,24,28,0.10);
    --accent: #C98A04;
    --accent-ink: #14181C;
    --flag-energy: #C8102E;
    --flag-telecom: #E06B22;
    --flag-waste: #0E8F7C;
    --flag-other: #8A8E92;
    --flag-none: #B7BBBE;
    --tier-strong: #1E7A3D;
    --tier-fit: #1F5590;
    --tier-marginal: #96631C;
    --tier-pass: #9CA0A6;
    --shadow: 0 1px 2px rgba(20,24,28,0.06), 0 10px 28px -14px rgba(20,24,28,0.22);
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) {
      --page: #101316; --surface: #171B1F; --surface-2: #1F2429; --ink: #F2F3F1; --ink-2: #C7CBCE;
      --muted: #8B9096; --hairline: #2B3136; --ring: rgba(242,243,241,0.10);
      --accent: #E8B93A; --accent-ink: #14120F;
      --flag-energy: #E23768; --flag-telecom: #C97320; --flag-waste: #1CA88F; --flag-other: #7A7F84; --flag-none: #4A4F54;
      --tier-strong: #3FA562; --tier-fit: #4C86D6; --tier-marginal: #B8873A; --tier-pass: #6B7076;
      --shadow: 0 1px 2px rgba(0,0,0,0.35), 0 14px 34px -16px rgba(0,0,0,0.6);
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --page: #101316; --surface: #171B1F; --surface-2: #1F2429; --ink: #F2F3F1; --ink-2: #C7CBCE;
    --muted: #8B9096; --hairline: #2B3136; --ring: rgba(242,243,241,0.10);
    --accent: #E8B93A; --accent-ink: #14120F;
    --flag-energy: #E23768; --flag-telecom: #C97320; --flag-waste: #1CA88F; --flag-other: #7A7F84; --flag-none: #4A4F54;
    --tier-strong: #3FA562; --tier-fit: #4C86D6; --tier-marginal: #B8873A; --tier-pass: #6B7076;
    --shadow: 0 1px 2px rgba(0,0,0,0.35), 0 14px 34px -16px rgba(0,0,0,0.6);
    color-scheme: dark;
  }
  :root[data-theme="light"] {
    --page: #FFFFFF; --surface: #FFFFFF; --surface-2: #F2F3F3; --ink: #14181C; --ink-2: #4B4F55;
    --muted: #7C8086; --hairline: #DCDFDE; --ring: rgba(20,24,28,0.10);
    --accent: #C98A04; --accent-ink: #14181C;
    --flag-energy: #C8102E; --flag-telecom: #E06B22; --flag-waste: #0E8F7C; --flag-other: #8A8E92; --flag-none: #B7BBBE;
    --tier-strong: #1E7A3D; --tier-fit: #1F5590; --tier-marginal: #96631C; --tier-pass: #9CA0A6;
    --shadow: 0 1px 2px rgba(20,24,28,0.06), 0 10px 28px -14px rgba(20,24,28,0.22);
    color-scheme: light;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--page); color: var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 26px clamp(16px, 4vw, 40px) 60px;
  }
  .stencil {
    font-family: "Bahnschrift", "Arial Narrow", "SF Compact Condensed", sans-serif;
    font-stretch: condensed; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  }
  .mono { font-family: "Cascadia Code", "Consolas", "SF Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }

  a { color: inherit; }
  *:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

  header.top {
    display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 12px 20px;
    border-bottom: 3px double var(--ink); padding-bottom: 16px; margin-bottom: 22px;
  }
  header.top .ticket-no { font-size: 10.5px; color: var(--muted); margin-bottom: 6px; }
  header.top h1 { font-size: 24px; margin: 0 0 6px; letter-spacing: 0.04em; text-wrap: balance; }
  header.top .sub { color: var(--ink-2); font-size: 12.5px; max-width: 60ch; }
  header.top .refreshed { font-size: 11px; color: var(--muted); text-align: right; }

  .kpi-row {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 1px;
    background: var(--hairline); border: 1px solid var(--hairline); border-radius: 4px; overflow: hidden;
    margin-bottom: 26px;
  }
  .kpi { background: var(--surface); padding: 14px 18px; }
  .kpi .k-label { font-size: 10px; color: var(--muted); margin-bottom: 8px; }
  .kpi .k-value { font-size: 28px; font-weight: 700; line-height: 1; }
  .kpi .k-value.accent { color: var(--tier-strong); }
  .k-delta { margin-top: 6px; font-size: 10.5px; font-weight: 700; }
  .k-delta.up { color: var(--tier-strong); }
  .k-delta.down { color: var(--flag-energy); }
  .k-delta.flat { color: var(--muted); }

  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; align-items: start; }
  @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }

  .panel { background: var(--surface); border: 1px solid var(--hairline); border-radius: 6px; box-shadow: var(--shadow); padding: 16px 18px; }
  .panel + .panel { margin-top: 18px; }
  .panel h2 { position: relative; font-size: 10.5px; color: var(--muted); margin: 0 0 16px; padding-bottom: 8px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; }
  .panel h2::after { content: ""; position: absolute; left: 0; bottom: 0; width: 28px; height: 2px; background: var(--accent); }

  .toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
  .search-box { flex: 1 1 200px; min-width: 160px; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 4px; padding: 9px 12px; font-size: 13.5px; color: var(--ink); }
  .chip-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { font: inherit; appearance: none; -webkit-appearance: none; border: 1px solid var(--hairline); background: var(--surface-2); color: var(--ink-2); font-size: 11.5px; padding: 8px 14px; min-height: 32px; border-radius: 3px; cursor: pointer; user-select: none; }
  .chip::-moz-focus-inner { border: 0; }
  .chip:hover { border-color: var(--accent); }
  .chip.active { background: var(--ink); color: var(--surface); border-color: var(--ink); }

  .callout { border: 1px solid var(--hairline); border-left: 3px solid var(--accent); background: var(--surface-2); border-radius: 0 4px 4px 0; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }

  /* Utility locate flag pin */
  .locate-flag { display: inline-flex; align-items: flex-start; width: 15px; height: 18px; position: relative; vertical-align: middle; margin-right: 8px; flex-shrink: 0; }
  .locate-flag .pole { width: 2px; height: 18px; background: var(--muted); }
  .locate-flag .pennant { width: 11px; height: 8px; margin-left: -1px; margin-top: 1px; clip-path: polygon(0 0, 100% 50%, 0 100%); }
  .flag-energy .pennant { background: var(--flag-energy); }
  .flag-telecom .pennant { background: var(--flag-telecom); }
  .flag-waste .pennant { background: var(--flag-waste); }
  .flag-other .pennant { background: var(--flag-other); }
  .flag-none .pole { background: var(--hairline); }

  table.ledger { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.ledger thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; padding: 8px 10px; border-bottom: 2px solid var(--ink); white-space: nowrap; }
  table.ledger thead .th-sort {
    all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 2px;
    font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit;
  }
  table.ledger thead .th-sort:hover { color: var(--ink); }
  table.ledger thead th[aria-sort="descending"] .th-sort::after { content: " \\2193"; }
  table.ledger thead th[aria-sort="ascending"] .th-sort::after { content: " \\2191"; }
  table.ledger tbody tr { cursor: pointer; }
  table.ledger tbody tr:hover td, table.ledger tbody tr:focus-visible td { background: var(--surface-2); }
  table.ledger tbody tr:hover td:first-child, table.ledger tbody tr:focus-visible td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
  table.ledger tbody tr:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  table.ledger td { padding: 10px; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  table.ledger td.num { text-align: right; }
  .company-cell { display: flex; align-items: flex-start; }
  .company-cell .txt .name { font-weight: 600; }
  .company-cell .txt .subj { color: var(--muted); font-size: 11.5px; margin-top: 2px; }
  .end-market-cell { white-space: nowrap; }

  /* Stamp */
  .stamp {
    display: inline-flex; align-items: center; gap: 6px; border: 2px solid currentColor; border-radius: 3px;
    padding: 3px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
    transform: rotate(-3deg); white-space: nowrap;
    animation: stamp-settle 0.22s ease-out;
  }
  @media (prefers-reduced-motion: reduce) { .stamp { animation: none; } }
  @keyframes stamp-settle { from { transform: rotate(-9deg) scale(1.15); opacity: 0; } to { transform: rotate(-3deg) scale(1); opacity: 1; } }
  .stamp-glyph { font-size: 10px; }
  .stamp-score { font-weight: 700; opacity: 0.75; }
  .stamp.stamp-strong-fit { color: var(--tier-strong); background: color-mix(in srgb, var(--tier-strong) 10%, transparent); }
  .stamp.stamp-fit { color: var(--tier-fit); background: color-mix(in srgb, var(--tier-fit) 10%, transparent); }
  .stamp.stamp-marginal { color: var(--tier-marginal); background: color-mix(in srgb, var(--tier-marginal) 12%, transparent); }
  .stamp.stamp-pass { color: var(--tier-pass); background: color-mix(in srgb, var(--tier-pass) 14%, transparent); opacity: 0.85; }

  .tier-composition-bar { display: flex; height: 12px; border-radius: 3px; overflow: hidden; background: var(--surface-2); margin-bottom: 14px; }
  .tier-seg { height: 100%; }
  .tier-seg.tier-strong-fit { background: var(--tier-strong); }
  .tier-seg.tier-fit { background: var(--tier-fit); }
  .tier-seg.tier-marginal { background: var(--tier-marginal); }
  .tier-seg.tier-pass { background: var(--tier-pass); }
  .tier-legend-item { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
  .tier-legend-item .stamp { transform: none; animation: none; flex-shrink: 0; }
  .tier-legend-count { margin-left: auto; font-weight: 700; font-family: "Cascadia Code", "Consolas", monospace; }

  .legend-row { margin-bottom: 12px; }
  .legend-top { display: flex; align-items: center; gap: 0; margin-bottom: 5px; }
  .legend-label { font-size: 12px; color: var(--ink-2); flex: 1; }
  .legend-count { font-weight: 700; font-size: 12.5px; font-family: "Cascadia Code", "Consolas", monospace; }
  .bar-track { background: var(--surface-2); border-radius: 3px; height: 6px; overflow: hidden; margin-left: 23px; }
  .bar-fill { height: 100%; border-radius: 3px; }
  .bar-fill.flag-fill-energy { background: var(--flag-energy); }
  .bar-fill.flag-fill-telecom { background: var(--flag-telecom); }
  .bar-fill.flag-fill-waste { background: var(--flag-waste); }
  .bar-fill.flag-fill-other { background: var(--flag-other); }
  .bar-fill.flag-fill-none { background: var(--flag-none); }
  .bar-fill.source-fill { background: var(--accent); }

  /* Deal Quality Funnel */
  .funnel-panel { margin-bottom: 26px; }
  .funnel-sub { font-size: 11.5px; color: var(--muted); margin: -10px 0 14px; }
  .funnel-chart { display: flex; flex-direction: column; gap: 2px; }
  .funnel-cap {
    height: 44px; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 4px 4px 0 0;
    display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .funnel-cap-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
  .funnel-cap-count { font-size: 18px; font-weight: 700; }
  .funnel-seg { position: relative; height: 64px; }
  .funnel-seg-shape { position: absolute; inset: 0; }
  .funnel-seg-marginal .funnel-seg-shape { background: var(--tier-marginal); }
  .funnel-seg-fit .funnel-seg-shape { background: var(--tier-fit); }
  .funnel-seg-strong .funnel-seg-shape { background: var(--tier-strong); }
  .funnel-label { position: relative; z-index: 1; height: 100%; display: flex; align-items: center; justify-content: center; }
  .funnel-label-pill {
    display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--hairline);
    border-radius: 999px; padding: 6px 16px; box-shadow: var(--shadow); font-size: 12.5px; color: var(--ink); white-space: nowrap;
  }
  .funnel-label-pill b { font-size: 15px; font-weight: 700; }
  .funnel-label-pill small { color: var(--muted); font-weight: 600; }
  .funnel-drops { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--hairline); }
  .funnel-drop { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-2); }
  .funnel-drop .mono { color: var(--muted); font-weight: 700; }
  .funnel-empty { padding: 24px; text-align: center; color: var(--muted); font-style: italic; font-size: 13px; }

  /* Detail drawer */
  .scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.4); opacity: 0; pointer-events: none; transition: opacity 0.18s; z-index: 40; }
  .scrim.open { opacity: 1; pointer-events: auto; }
  .drawer {
    position: fixed; top: 0; right: 0; height: 100%; width: min(440px, 92vw); background: var(--surface);
    border-left: 1px solid var(--hairline); box-shadow: -12px 0 40px -16px rgba(0,0,0,0.4);
    transform: translateX(100%); transition: transform 0.2s ease; z-index: 41; overflow-y: auto; padding: 22px;
  }
  .drawer.open { transform: translateX(0); }
  .drawer-close { background: none; border: 1px solid var(--hairline); border-radius: 4px; color: var(--ink-2); font-size: 12.5px; padding: 6px 10px; cursor: pointer; float: right; }
  .drawer-close:hover { border-color: var(--accent); color: var(--ink); }
  .drawer .drawer-flag { display: flex; align-items: center; margin: 28px 0 4px; }
  .drawer h3 { font-size: 19px; margin: 4px 0 2px; text-wrap: balance; }
  .drawer .drawer-subj { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
  .drawer .drawer-ticket { color: var(--muted); font-size: 10.5px; margin-bottom: 14px; }
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; margin: 16px 0; }
  .field { font-size: 12.5px; }
  .field .f-label { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
  .field .f-value { font-weight: 600; }
  .field.full { grid-column: 1 / -1; }
  .rationale-box { background: var(--surface-2); border-radius: 4px; padding: 12px 14px; font-size: 13px; line-height: 1.5; margin-bottom: 16px; }
  .drawer a.email-link { display: inline-block; background: var(--accent); color: var(--accent-ink); text-decoration: none; font-size: 13px; font-weight: 700; padding: 9px 16px; border-radius: 4px; }
  .drawer a.email-link:hover { opacity: 0.9; }

  footer.foot { margin-top: 26px; padding-top: 14px; border-top: 1px solid var(--hairline); color: var(--muted); font-size: 11px; }
  ::selection { background: var(--accent); color: var(--accent-ink); }
</style>
</head>
<body>

<header class="top">
  <div>
    <div class="ticket-no mono">TICKET LOG &middot; XIP PRINCIPAL INVESTING</div>
    <h1 class="stencil">XIP Deal Funnel</h1>
  </div>
  <div class="refreshed mono" id="refreshed-at"></div>
</header>

<div class="kpi-row">
  <div class="kpi"><div class="k-label stencil">Screened</div><div class="k-value mono">${totalScreened}</div></div>
  <div class="kpi"><div class="k-label stencil">New / 7 Days</div><div class="k-value mono">${newLast7}</div>${weekDeltaHtml}</div>
  <div class="kpi"><div class="k-label stencil">Strong Fit</div><div class="k-value mono accent">${strongFit}</div></div>
  <div class="kpi"><div class="k-label stencil">Fit</div><div class="k-value mono">${fit}</div></div>
  <div class="kpi"><div class="k-label stencil">Needs Review</div><div class="k-value mono">${needsReview}</div></div>
</div>

<div class="panel funnel-panel">
  <h2>Deal Quality Funnel</h2>
  <div class="funnel-sub">Stage-1 survivors, filtered by minimum qualifying tier</div>
  ${funnelHtml}
</div>

<div class="layout">
  <div class="main-col">
    <div class="panel">
      <h2>Deal Ledger</h2>
      <div class="toolbar">
        <label class="visually-hidden" for="search">Search deals</label>
        <input class="search-box" id="search" type="text" placeholder="Search company, subject, end-market&hellip;" />
        <div class="chip-row" id="tier-filters" role="group" aria-label="Filter by fit tier">
          <button type="button" class="chip active" data-tier="all" aria-pressed="true">All</button>
          <button type="button" class="chip" data-tier="Strong Fit" aria-pressed="false">Strong Fit</button>
          <button type="button" class="chip" data-tier="Fit" aria-pressed="false">Fit</button>
          <button type="button" class="chip" data-tier="Marginal" aria-pressed="false">Marginal</button>
          <button type="button" class="chip" data-tier="Pass" aria-pressed="false">Pass</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table class="ledger" id="ledger">
          <thead>
            <tr>
              <th><button type="button" class="th-sort" data-key="dateReceived">Received</button></th>
              <th><button type="button" class="th-sort" data-key="targetCompany">Target</button></th>
              <th><button type="button" class="th-sort" data-key="endMarket">Locate</button></th>
              <th><button type="button" class="th-sort" data-key="sourceQuality">Source</button></th>
              <th><button type="button" class="th-sort" data-key="fitTier">Tier</button></th>
              <th aria-sort="descending"><button type="button" class="th-sort" data-key="fitScore">Score</button></th>
            </tr>
          </thead>
          <tbody id="ledger-body"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="side-col">
    <div class="panel">
      <h2>By Fit Tier</h2>
      <div class="tier-composition-bar" aria-hidden="true">${tierBarSegments}</div>
      ${tierLegend}
    </div>
    <div class="panel">
      <h2>Utility Locate Legend</h2>
      ${legendRows}
    </div>
    <div class="panel">
      <h2>By Deal Source</h2>
      ${sourceBarRows}
    </div>
  </div>
</div>

<footer class="foot">
  Source of truth: <span class="mono">XIP_Deal_Funnel_Intake.xlsx</span> (local). Regenerated on refresh.
</footer>

<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Deal details" aria-hidden="true">
  <button class="drawer-close" id="drawer-close">Close</button>
  <div id="drawer-content"></div>
</aside>

<script>
  const DEALS = ${dataJson};
  const FLAG_LABEL = ${JSON.stringify(FLAG_LABEL)};
  document.getElementById('refreshed-at').textContent = 'Refreshed ' + new Date(${JSON.stringify(now.toISOString())}).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const tierClass = (t) => 'stamp-' + String(t).toLowerCase().replace(/\\s+/g, '-');
  const tierGlyph = (t) => t === 'Strong Fit' ? '&#10003;' : t === 'Pass' ? '&#10005;' : '&#9679;';

  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function flagPin(flag) {
    if (flag === 'none') return '<span class="locate-flag flag-none" title="' + escHtml(FLAG_LABEL[flag]) + '"><span class="pole"></span></span>';
    return '<span class="locate-flag flag-' + flag + '" title="' + escHtml(FLAG_LABEL[flag]) + '"><span class="pole"></span><span class="pennant"></span></span>';
  }
  function stamp(tier, score) {
    return '<span class="stamp ' + tierClass(tier) + '"><span class="stamp-glyph">' + tierGlyph(tier) + '</span>' + escHtml(tier) + (score !== '' ? '<span class="stamp-score">' + score + '</span>' : '') + '</span>';
  }

  let state = { query: '', tier: 'all', sortKey: 'fitScore', sortDir: 'desc' };

  function applyFilters() {
    let rows = DEALS.slice();
    if (state.tier !== 'all') rows = rows.filter(d => d.fitTier === state.tier);
    if (state.query) {
      const q = state.query.toLowerCase();
      rows = rows.filter(d =>
        (d.targetCompany || '').toLowerCase().includes(q) ||
        (d.subject || '').toLowerCase().includes(q) ||
        (d.endMarket || '').toLowerCase().includes(q) ||
        (d.geography || '').toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => {
      let av = a[state.sortKey], bv = b[state.sortKey];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return state.sortDir === 'asc' ? -1 : 1;
      if (av > bv) return state.sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }

  function render() {
    const rows = applyFilters();
    const body = document.getElementById('ledger-body');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);font-style:italic;padding:24px;">No deals match</td></tr>';
      return;
    }
    body.innerHTML = rows.map(d => \`
      <tr data-idx="\${DEALS.indexOf(d)}" tabindex="0" role="button" aria-label="View details for \${escHtml(d.targetCompany || d.subject)}">
        <td class="mono">\${escHtml(d.dateReceived)}</td>
        <td><div class="company-cell"><div class="txt"><div class="name">\${escHtml(d.targetCompany || d.subject)}</div><div class="subj">\${escHtml(d.subject)}</div></div></div></td>
        <td class="end-market-cell">\${flagPin(d.flag)}\${escHtml(d.endMarket)}</td>
        <td>\${escHtml(d.sourceQuality)}</td>
        <td>\${stamp(d.fitTier, '')}</td>
        <td class="num mono">\${d.fitScore}</td>
      </tr>
    \`).join('');

    body.querySelectorAll('tr[data-idx]').forEach(tr => {
      tr.addEventListener('click', () => openDrawer(DEALS[Number(tr.dataset.idx)], tr));
      tr.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDrawer(DEALS[Number(tr.dataset.idx)], tr);
        }
      });
    });
  }

  let lastFocusedTrigger = null;
  function openDrawer(d, triggerEl) {
    lastFocusedTrigger = triggerEl || document.activeElement;
    const content = document.getElementById('drawer-content');
    content.innerHTML = \`
      <div class="drawer-flag">\${flagPin(d.flag)}<span style="font-size:11.5px;color:var(--muted)">\${escHtml(FLAG_LABEL[d.flag])}</span></div>
      <h3>\${escHtml(d.targetCompany || d.subject)}</h3>
      <div class="drawer-subj">\${escHtml(d.subject)}</div>
      <div class="drawer-ticket mono">TICKET \${escHtml(d.id)} &middot; RECEIVED \${escHtml(d.dateReceived)}</div>
      \${stamp(d.fitTier, d.fitScore)}
      <div class="field-grid">
        <div class="field"><div class="f-label">Geography</div><div class="f-value">\${escHtml(d.geography)}</div></div>
        <div class="field"><div class="f-label">Source</div><div class="f-value">\${escHtml(d.sourceQuality)}</div></div>
        <div class="field"><div class="f-label">Broker / Platform</div><div class="f-value">\${escHtml(d.brokerPlatform)}</div></div>
        <div class="field"><div class="f-label">Business Model</div><div class="f-value">\${escHtml(d.businessModel)}</div></div>
        <div class="field"><div class="f-label">EBITDA</div><div class="f-value mono">\${escHtml(d.ebitda)}</div></div>
        <div class="field"><div class="f-label">Revenue</div><div class="f-value mono">\${escHtml(d.revenue)}</div></div>
        <div class="field"><div class="f-label">EBITDA Margin</div><div class="f-value mono">\${escHtml(d.ebitdaMargin)}</div></div>
        <div class="field"><div class="f-label">Asking Price / EV</div><div class="f-value mono">\${escHtml(d.askingPrice)}</div></div>
        <div class="field"><div class="f-label">Management</div><div class="f-value">\${escHtml(d.managementQuality)}</div></div>
        <div class="field"><div class="f-label">PE-Owned</div><div class="f-value">\${escHtml(d.peOwned)}</div></div>
        <div class="field full"><div class="f-label">Process Notes</div><div class="f-value">\${escHtml(d.processNotes) || '&mdash;'}</div></div>
      </div>
      <div class="field"><div class="f-label">AI Rationale</div></div>
      <div class="rationale-box">\${escHtml(d.aiRationale) || '<em>No rationale recorded.</em>'}</div>
      \${d.emailLink ? \`<a class="email-link" href="\${escHtml(d.emailLink)}" target="_blank" rel="noopener">Open Original Email</a>\` : ''}
    \`;
    const drawer = document.getElementById('drawer');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.getElementById('scrim').classList.add('open');
    requestAnimationFrame(() => document.getElementById('drawer-close').focus());
  }
  function closeDrawer() {
    const drawer = document.getElementById('drawer');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.getElementById('scrim').classList.remove('open');
    if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') lastFocusedTrigger.focus();
  }
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  document.getElementById('drawer').addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const focusables = Array.from(document.getElementById('drawer').querySelectorAll('button, a[href]'));
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  document.getElementById('search').addEventListener('input', e => { state.query = e.target.value; render(); });
  document.getElementById('tier-filters').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#tier-filters .chip').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
    chip.classList.add('active');
    chip.setAttribute('aria-pressed', 'true');
    state.tier = chip.dataset.tier;
    render();
  });
  document.querySelectorAll('table.ledger thead button.th-sort').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (state.sortKey === key) { state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc'; }
      else { state.sortKey = key; state.sortDir = key === 'fitScore' ? 'desc' : 'asc'; }
      document.querySelectorAll('table.ledger thead th').forEach(t => t.removeAttribute('aria-sort'));
      btn.closest('th').setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
      render();
    });
  });

  render();
</script>
</body>
</html>`;

  fs.writeFileSync(outputHtmlPath, html, "utf8");
  return outputHtmlPath;
}

if (require.main === module) {
  const [workbookPath, outPath] = process.argv.slice(2);
  if (!workbookPath || !outPath) {
    console.error("Usage: node build-interactive-dashboard.js <workbookPath> <outputHtmlPath>");
    process.exit(1);
  }
  build(workbookPath, outPath);
  console.log("Wrote", outPath);
}

module.exports = { build };
