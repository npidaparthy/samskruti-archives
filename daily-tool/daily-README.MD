# Daily Verse Card — tool spec

Automated "verse of the day": each morning a scheduled job picks a verse, renders a
share card (PNG) + caption, publishes them to the site's `/daily` page, and archives a
dated copy. One generator, many sites — driven entirely by each site's `config.json`.

Next iteration adds Telegram auto-posting (see §11). Until then, sharing is one tap
from the `/daily` page (`wa.me` / Web Share).

---

## 1. Architecture — three roles, one source of truth

```
┌──────────────────────────────────────────────────────────────┐
│ CENTRAL: samskruti-archives (single source of truth)         │
│                                                              │
│  daily-tool/                 ← generator CODE (never copied  │
│    src/gen.js                  into sites; sites CALL it)    │
│    src/render.html                                           │
│    src/sections/*.js         ← one draw fn per section type  │
│    src/order/                ← per-site rotation orders      │
│    site-assets/              ← viewing page template         │
│      index.html  daily.css  daily.js                         │
│    install.sh                ← one-time per-site bootstrap    │
│    README.md                 ← this file                     │
│                                                              │
│  .github/workflows/daily-reusable.yml   ← workflow_call       │
│                                                              │
│  samskruti/YYYYMMDD/…        ← dated archive OUTPUTS          │
│  smruti/YYYYMMDD/…           ← dated archive OUTPUTS          │
└──────────────────────────────────────────────────────────────┘
        ▲ called by                       ▲ pushed to
        │                                 │
┌───────┴───────────────┐        ┌────────┴──────────────┐
│ SITE: samskruti        │        │ SITE: smruti          │
│  .github/workflows/    │        │  .github/workflows/   │
│    daily.yml (caller)  │        │    daily.yml (caller) │
│  daily/config.json     │        │  daily/config.json    │
│  daily/index.html …    │        │  daily/index.html …   │
│  daily/today.png/txt   │        │  daily/today.png/txt  │
└────────────────────────┘        └───────────────────────┘
```

- **Generator code + reusable workflow** live ONLY in central. Sites reference them.
- **Sites** store only: a caller workflow, `config.json`, the viewing page, and the
  generated `today.*`. Deleting `daily/` + `daily.yml` removes the feature from a site.
- **Archive outputs** accumulate in central (`samskruti-archives/<site>/YYYYMMDD/`);
  the site repos never accumulate — `today.*` is overwritten each day.

---

## 2. The daily run (flow)

1. Site's caller workflow fires on cron (e.g. `0 1 * * *` ≈ 06:30 IST).
2. It `uses:` the central reusable workflow, passing `site` + config path.
3. Reusable workflow: checks out (a) central `daily-tool`, (b) the calling site repo;
   installs Node + headless Chromium + the Indic fonts.
4. `gen.js` reads the site `config.json`, resolves the day's verse via
   `order/<site>.json` (`dayNumber % N`), loads that verse's JSON.
5. Puppeteer opens `render.html`, which draws only the sections in `config.sections`
   (resolved through `config.fieldMap`) → screenshots the card → `today.png`.
6. Writes `today.txt` (caption) + `today.log`.
7. Commits `today.*` to the SITE repo (overwrite).
8. Pushes a dated copy to `samskruti-archives/<site>/YYYYMMDD/` using `ARCHIVE_TOKEN`.
9. Site's Pages deploy serves the refreshed `/daily` page.

GitHub cron is not exact (can drift 5–15 min, rarely skip). Fine for a daily card.

---

## 3. `config.json` schema (per site)

```jsonc
{
  "site": "samskruti",

  // WHERE the verses are + how to enumerate them
  "source": {
    "glob": "data/subhashitam/**/*.json",
    "index": "data/subhashitam/_index.json"     // optional, for id list
  },

  // MAP this site's schema → generic card "slots"
  "fieldMap": {
    "verse":   "shlokam.te",
    "source":  "granthaH.name_en",
    "meaning": "meaning.te"
    // samskruti has no word-by-word → simply omit it
  },

  // WHICH slots to draw, in order
  "sections": ["verse", "source", "meaning"],

  // caption for share/Telegram; {slot} tokens resolved from fieldMap
  "caption": "{verse}\n\n{meaning}\n— {source}\n{link}",
  "link": "https://samskruti.info/#/daily",

  // card look (optional; defaults if omitted)
  "theme": { "template": "palm-leaf", "accent": "#c8a84b" },

  // selection
  "selection": { "mode": "rotation", "order": "order/samskruti.json", "epoch": "2026-08-01" },

  // where dated copies go
  "archive": { "repo": "yourname/samskruti-archives", "path": "samskruti" },

  // next iteration
  "telegram": { "enabled": false, "chatIds": [], "tokenSecret": "TELEGRAM_TOKEN" }
}
```

### smruti example (has word-by-word)
```jsonc
{
  "site": "smruti",
  "source": { "glob": "data/gita/**/*.json" },
  "fieldMap": {
    "verse":      "shloka.devanagari",
    "wordbyword": "anvaya.wordmeanings",    // ← extra slot samskruti lacks
    "meaning":    "translation.te",
    "source":     "reference"
  },
  "sections": ["verse", "wordbyword", "meaning", "source"],
  "caption": "{verse}\n\n{wordbyword}\n\n{meaning}\n— {source}\n{link}",
  "archive": { "repo": "yourname/samskruti-archives", "path": "smruti" }
}
```

---

## 4. Section system (schema-independent)

- Each **section type** = a small draw function in `daily-tool/src/sections/`
  (`verse.js`, `wordbyword.js`, `meaning.js`, `source.js`, …).
- `render.html` loops `config.sections` → resolves each via `config.fieldMap` →
  reads the value from the verse JSON → calls that section's draw fn.
- **Missing field → section skipped gracefully.** So samskruti (no `wordbyword`) and
  smruti (with it) run the identical code; only their config differs.
- **Adding a NEW kind of section** (never rendered before): add one file in
  `sections/`, then list it in a site's `config.sections`. Code change once, then
  config-only for every site.

---

## 5. Installing on a new site (one-time)

Run the install script from the central repo, targeting a site checkout:

```bash
# from samskruti-archives/daily-tool/
./install.sh --site smruti --target ../../smruti.samskruti.info
```

It copies/creates, in the target site repo:
- `.github/workflows/daily.yml` — the caller (see §6)
- `daily/config.json` — a template to fill in (source + fieldMap + sections + caption)
- `daily/index.html`, `daily/daily.css`, `daily/daily.js` — the viewing page
- prints the **manual steps** (§10): enable Actions write, add `ARCHIVE_TOKEN`.

Re-running `install.sh` later **re-syncs the viewing page** if it changed centrally
(it never overwrites `config.json`).

---

## 6. Caller workflow (lives in each site)

```yaml
# .github/workflows/daily.yml
name: Daily verse card
on:
  schedule: [{ cron: "0 1 * * *" }]
  workflow_dispatch: {}            # manual "run now"
jobs:
  daily:
    if: ${{ hashFiles('daily/config.json') != '' }}   # no-op if daily/ removed
    uses: yourname/samskruti-archives/.github/workflows/daily-reusable.yml@main
    with:
      config: daily/config.json
    secrets:
      ARCHIVE_TOKEN: ${{ secrets.ARCHIVE_TOKEN }}
      TELEGRAM_TOKEN: ${{ secrets.TELEGRAM_TOKEN }}   # optional, later
```

Pin `@main` for auto-updates, or `@v1` to freeze a version.

---

## 7. Updating the tool (propagation model)

| Change | How sites get it |
|---|---|
| Generator code (`gen.js`, `sections/*`) | **Automatic** next run (checked out from central at run time) |
| Reusable workflow | **Automatic** (sites reference `@main`) |
| Viewing page (`index.html`/css/js) | Re-run `install.sh` per site (or a dispatch workflow that opens sync PRs) |
| A site's config / sections / caption | Edit that site's `daily/config.json` — no central change |

So day-to-day + per-site changes are **config-only**; central code updates propagate
by themselves. Only the served viewing page needs an explicit re-sync.

---

## 8. Verse selection (deterministic, no repeats)

`order/<site>.json` is a **fixed shuffled list** of all verse IDs, generated once.
`index = daysSince(config.epoch) % N` walks it in order — every verse appears once
before any repeat, and the same date always yields the same verse (reproducible).
Regenerating `order.json` reshuffles (use sparingly).

---

## 9. Archiving

The run pushes `<site>/YYYYMMDD/{card.png,caption.txt,run.log}` to the central archive
repo with `ARCHIVE_TOKEN`. Site repos stay lean (only `today.*`). No local machine
involved, so no run is ever missed.

---

## 10. Manual setup checklist (one-time)

Per site:
1. Repo → Settings → Actions → Workflow permissions → **Read and write**.
2. Create a **fine-grained PAT** with `contents:write` on `samskruti-archives`; add it
   as secret **`ARCHIVE_TOKEN`** in the site repo.
3. Run `install.sh`, then fill `daily/config.json`.
4. (Optional, later) add secret **`TELEGRAM_TOKEN`** and set `telegram.enabled`.

Central repo (once): create `daily-reusable.yml`, `daily-tool/`, and the `samskruti/`
`smruti/` output folders (done).

---

## 11. Telegram (next iteration — extension point, not yet built)

`gen.js` ends with a `publish` step. Today it only writes files. Next iteration: if
`config.telegram.enabled`, it reads `TELEGRAM_TOKEN` (secret) + `chatIds` (config) and
POSTs `today.png` + caption to each chat via the Telegram Bot API — official, free,
posts to groups/channels. No Part-1 rework; a gated final step.

---

## 12. Removing the feature (per site)

Delete `daily/` and `.github/workflows/daily.yml`. The caller's `if:` guard means even
a stray workflow no-ops. Nothing else in the site references it.

---

## 13. Caveats

- **Fonts**: headless Chromium needs Tiro Devanagari / Noto Sans Telugu installed in
  the runner (the reusable workflow does this) or Indic text renders as boxes.
- **Cron timing**: not exact; acceptable for a daily card.
- **Secrets**: `ARCHIVE_TOKEN` / `TELEGRAM_TOKEN` are GitHub Secrets — never in the repo.
- **Duplication**: none — one generator, called by all sites. Only the viewing page is
  copied (small, rarely changed).
</content>
