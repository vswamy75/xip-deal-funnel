// Appends new deal rows to the intake workbook, deduped by Message ID.
// Usage: node append-rows.js <existingWorkbookPath> <newRowsJsonPath> <outputPath>
// newRowsJsonPath must contain a JSON array of objects keyed by schema.js `key` names.
const fs = require("fs");
const XLSX = require("xlsx");
const { COLUMNS, SHEET_NAME } = require("./schema");

function loadExistingRows(wb) {
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function appendRows(existingWorkbookPath, newRows) {
  const wb = XLSX.readFile(existingWorkbookPath);
  const existingRows = loadExistingRows(wb);
  const existingIds = new Set(existingRows.map((r) => r["Message ID"]).filter(Boolean));

  const nextDealId =
    existingRows.reduce((max, r) => {
      const n = parseInt(String(r["Deal ID"]).replace(/\D/g, ""), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1;

  let counter = nextDealId;
  const added = [];
  for (const row of newRows) {
    if (row.messageId && existingIds.has(row.messageId)) continue;
    const rowObj = {};
    for (const col of COLUMNS) {
      if (col.key === "dealId") {
        rowObj[col.header] = `DF-${String(counter).padStart(5, "0")}`;
      } else {
        rowObj[col.header] = row[col.key] ?? "";
      }
    }
    added.push(rowObj);
    counter += 1;
  }

  const allRows = [...existingRows, ...added];
  const headers = COLUMNS.map((c) => c.header);
  const ws = XLSX.utils.json_to_sheet(allRows, { header: headers });
  const lastCol = XLSX.utils.encode_col(headers.length - 1);
  ws["!autofilter"] = { ref: `A1:${lastCol}${allRows.length + 1}` };
  ws["!cols"] = COLUMNS.map(() => ({ wch: 20 }));
  wb.Sheets[SHEET_NAME] = ws;

  return { wb, addedCount: added.length, totalCount: allRows.length };
}

if (require.main === module) {
  const [existingPath, newRowsPath, outPath] = process.argv.slice(2);
  if (!existingPath || !newRowsPath || !outPath) {
    console.error("Usage: node append-rows.js <existingWorkbookPath> <newRowsJsonPath> <outputPath>");
    process.exit(1);
  }
  const newRows = JSON.parse(fs.readFileSync(newRowsPath, "utf8"));
  const { wb, addedCount, totalCount } = appendRows(existingPath, newRows);
  XLSX.writeFile(wb, outPath);
  console.log(`Added ${addedCount} new row(s). Total rows: ${totalCount}. Wrote ${outPath}`);
}

module.exports = { appendRows, loadExistingRows };
