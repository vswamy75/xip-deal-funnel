// Shared column schema for the XIP Deal Funnel intake table.
// "hidden" columns are still real columns in the sheet (SheetJS has no cell-hide),
// they're just excluded from the human-facing dashboard renderer.
const COLUMNS = [
  { key: "dealId", header: "Deal ID" },
  { key: "dateReceived", header: "Date Received" },
  { key: "subject", header: "Subject" },
  { key: "sender", header: "Sender" },
  { key: "sourceQuality", header: "Source Quality" },
  { key: "targetCompany", header: "Target Company" },
  { key: "endMarket", header: "End-Market" },
  { key: "geography", header: "Geography" },
  { key: "ebitda", header: "EBITDA" },
  { key: "revenue", header: "Revenue" },
  { key: "ebitdaMargin", header: "EBITDA Margin" },
  { key: "askingPrice", header: "Asking Price / EV" },
  { key: "businessModel", header: "Business Model" },
  { key: "managementQuality", header: "Management Quality" },
  { key: "peOwned", header: "PE-Owned" },
  { key: "brokerPlatform", header: "Broker / Platform" },
  { key: "processNotes", header: "Process Notes" },
  { key: "fitScore", header: "Fit Score" },
  { key: "fitTier", header: "Fit Tier" },
  { key: "aiRationale", header: "AI Rationale" },
  { key: "attachments", header: "Attachments" },
  { key: "emailLink", header: "Email Link" },
  { key: "status", header: "Status" },
  { key: "messageId", header: "Message ID" },
  { key: "processedTimestamp", header: "Processed Timestamp" },
];

const SHEET_NAME = "Deal Funnel";
const TABLE_NAME = "DealFunnelIntake";

module.exports = { COLUMNS, SHEET_NAME, TABLE_NAME };
