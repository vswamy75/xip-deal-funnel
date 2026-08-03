# XIP Deal Funnel

A standalone snapshot of the XIP Deal Funnel dashboard — a single self-contained
`index.html`, no build step, no server, no dependencies. Hosted as a static site
(e.g. GitHub Pages) so it works independent of any particular machine or account.

## What this is

Deal data pulled from XIP's inbound deal-flow inbox, screened against XIP's
investment rubric (infrastructure asset developers — energy, telecom, water),
and rendered here as a searchable, sortable ledger with a detail view per deal.

## Keeping it current

This file is a snapshot as of whenever it was last published here — it does not
auto-refresh from the live workbook. To update it, regenerate the dashboard from
the current data and replace `index.html`:

```
node scripts/build-interactive-dashboard.js <path-to-workbook.xlsx> index.html
```

(see the `deal-funnel` project for the generator script and the rest of the
intake automation), then commit and push — GitHub Pages redeploys automatically
on push to the default branch.

## Publishing

1. Create an empty GitHub repo (no README/license, so it's truly empty).
2. From this folder:
   ```
   git remote add origin <your-repo-url>
   git branch -M main
   git push -u origin main
   ```
3. In the repo's Settings → Pages, set the source to the `main` branch, `/ (root)` folder.
4. GitHub serves it at `https://<username>.github.io/<repo-name>/` within a minute or two.
