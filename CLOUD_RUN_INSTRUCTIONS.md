# XIP Deal Funnel — Cloud Routine Run Instructions

This is the cloud-routine counterpart of the original local automation. It runs in an
isolated cloud session with a fresh clone of this repo each time — there is no local
machine involved, and no `C:\...` paths. Everything the pipeline needs (workbook,
scripts, rubric) lives in this repo, and the dashboard IS `index.html` at repo root,
served live by GitHub Pages. There's no separate "publish" step — committing and
pushing *is* publishing.

Run these steps every time this routine fires.

## 0. Install dependencies
Run `npm install` in the repo root (this environment is fresh each run; nothing persists
except what's committed to the repo).

## 1. Load state
Read `data/state.json` for `lastCheckedISO`.

## 2. Search the inbox
Use whichever Outlook / Microsoft 365 email-search tool is available via the attached
MCP connection to search `inbound@xipllc.com` for emails received after `lastCheckedISO`
minus a 15-minute buffer, newest first. Paginate fully. If the connection only has access
to a personal mailbox rather than the `inbound@xipllc.com` shared mailbox, stop and report
that clearly — do not silently scan the wrong mailbox.

## 3. Stage-1 filter (cheap, no full read)
Using only subject + sender + preview/snippet, apply the "Stage-1 pre-filter" section of
`rubric.md`. Drop anything that doesn't pass. Don't fetch full bodies for dropped items.

## 4. Score survivors
For every email that passes Stage 1, fetch the full body. Score each against `rubric.md`,
extracting every field in `scripts/schema.js` (COLUMNS, keyed by `key` not `header`). Mark
anything not stated in the email as `"Unknown"` rather than guessing. Always include a
1-sentence `aiRationale`. If a single email bundles multiple unrelated businesses (as
broker blast emails sometimes do), score only the businesses that plausibly fit XIP's
infra/consumer-facing-in-mandate profile as their own rows, and note in Process Notes that
the email bundled other, excluded businesses.

## 5. Write new rows
Build a JSON array of new row objects (schema `key` names, not headers), save to
`data/_pending_rows.json`, then run:

```
node scripts/append-rows.js data/XIP_Deal_Funnel_Intake.xlsx data/_pending_rows.json data/XIP_Deal_Funnel_Intake.xlsx
```

This dedupes by `messageId` automatically. Delete `data/_pending_rows.json` afterward.

## 6. Regenerate the dashboard
Run:

```
node scripts/build-interactive-dashboard.js data/XIP_Deal_Funnel_Intake.xlsx index.html
```

Note the output path is `index.html` at repo root — that's the live GitHub Pages file,
not a separate local copy. Do this even if zero new deals were found, to keep the
"Refreshed" timestamp honest.

## 7. Update state
Overwrite `data/state.json`'s `lastCheckedISO` with the current run time (UTC ISO).

## 8. Commit and push
```
git add -A
git commit -m "Auto-sync dashboard <current UTC timestamp>"
git push origin HEAD:main
```
Use `HEAD:main`, not bare `main` — this environment's fresh clone starts in detached
HEAD. `git push origin main` pushes the untouched local `main` ref (a silent no-op:
exits 0, prints "Everything up-to-date", nothing reaches GitHub Pages) rather than the
commit you just made on HEAD. This exact bug stranded ~2 days / 50 runs of commits
before it was caught on 2026-08-25 — verify with `git log --oneline origin/main..HEAD`
after pushing; it should be empty.

If there's nothing to commit (identical content since last run), skip onward — that's
fine. If the push fails (auth/credential issue), don't retry repeatedly — report it
clearly so a human can re-authenticate the routine's git access.

## 9. Report
One-line summary: emails scanned, how many passed Stage 1, how many new deals logged
(with tier breakdown: Strong Fit / Fit / Marginal / Pass), how many dropped as noise.

## Not in scope
Do not write to SharePoint or OneDrive. Do not modify `rubric.md` unless explicitly asked
to in this run's instructions. There is no Claude Artifact publish step in this cloud
version — GitHub Pages (this repo's `index.html`) is the single live dashboard link.

## Verified constraints (2026-08-31)

Three things confirmed by testing; they save a lot of re-diagnosis.

**The routine must be created in the claude.ai Routines UI.** A routine created
programmatically from inside a Claude session inherits that session's tool allowlist,
which contains no MCP connector tools. The fired session therefore has no Microsoft 365
access and aborts in ~30s. Two were built this way and both failed, including on a real
scheduled fire. See `ROUTINE_PROMPT.md` for the exact prompt, schedule, and settings.

**`get_me` returns shruti.nayar@xipllc.com, not inbound@.** That is expected. The shared
mailbox is reached solely through the `mailboxOwnerEmail` parameter (delegate access).
An earlier note in `state.json` claimed the signed-in identity *was* inbound@ — it was
wrong, and a run trusting it could wrongly conclude it was in the wrong mailbox.

**Search query shape matters.** Date-bounded windows (both `afterDateTime` and
`beforeDateTime`, <=12h) are fast and reliable. Open-ended or multi-day windows
intermittently time out at 60s. A timeout is a performance problem, not an access
denial — retry or split into bands. To distinguish a genuinely empty window from a
failing tool, run the narrow positive control in `ROUTINE_PROMPT.md`.

**How to tell a run worked:** a successful run always commits, even with zero new
emails, because the dashboard Refreshed timestamp changes. No commit means it did not
run — whatever its reported status. A sub-minute "succeeded" is an abort.
