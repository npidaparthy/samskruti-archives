# Daily Verse Card — tool spec

Automated "verse of the day". Each morning a scheduled job, **per feed**, picks a verse,
renders a share card (PNG) + caption, publishes them to the site's `/daily/<feed>` page,
and archives a dated copy centrally. One generator serves many sites and many feeds —
driven entirely by each site's `config.json`.

- **Multi-feed:** a site can run several independent daily feeds (e.g. `subhashitam`,
  `stotram`, `yogasutra`), each with its own verse pool, card, output, and Telegram group.
- **Sharing:** until Telegram is wired (§11), one tap from the `/daily/<feed>` page
  (`wa.me` / Web Share). Telegram auto-post is a gated final step, no Part-1 rework.

---

## 1. Architecture — three roles, one source of truth

```
┌──────────────────────────────────────────────────────────────┐
│ CENTRAL: samskruti-archives (single source of truth)         │
│                                                              │
│  daily-tool/                                                 │
│    README.MD                 ← this file                     │
│    design/palm-leaf-card.html  ← reference card design       │
│    src/                                                      │
│      gen.js                  ← selection + render + publish  │
│      render.html                                             │
│      sections/*.js           ← one draw fn per section type  │
│      renderer.js             ← vendored palm-leaf draw code  │
│      package.json                                            │
│    site-assets/              ← viewing-page template         │
│      index.html  daily.css  daily.js                         │
│    order/                    ← per-site-per-feed rotations   │
│      samskruti.subhashitam.json                              │
│      samskruti.yogasutra.json                                │
│    install.sh                ← one-time per-site bootstrap    │
│                                                              │
│  .github/workflows/daily-reusable.yml   ← workflow_call       │
│                                                              │
│  samskruti/<feed>/YYYYMMDD/…  ← dated archive OUTPUTS         │
│  smruti/<feed>/YYYYMMDD/…     ← dated archive OUTPUTS         │
└──────────────────────────────────────────────────────────────┘
        ▲ called by                       ▲ pushed to (ARCHIVE_TOKEN)
        │                                 │
┌───────┴───────────────┐        ┌────────┴──────────────┐
│ SITE: samskruti        │        │ SITE: smruti          │
│  .github/workflows/    │        │  .github/workflows/   │
│    daily.yml (caller)  │        │    daily.yml (caller) │
│  daily/config.json     │        │  daily/config.json    │
│  daily/index.html …    │        │  daily/index.html …   │
│  daily/<feed>/today.*  │        │  daily/<feed>/today.* │
└────────────────────────┘        └───────────────────────┘
```

- **Generator code + reusable workflow** live ONLY in central. Sites **call** them
  (they do not copy the generator).
- **Sites** store only: a caller workflow, `config.json`, the viewing page, and the
  generated `daily/<feed>/today.*`. Deleting `daily/` + `daily.yml` removes the feature.
- **Archive outputs** accumulate centrally; site repos never accumulate — each feed's
  `today.*` is overwritten daily.

---

## 2. The daily run (flow)

1. Site's caller workflow fires on cron (see §8 for the 4 AM-Sydney two-cron setup).
2. It `uses:` the central reusable workflow, passing the config path.
3. Reusable workflow checks out (a) central `daily-tool`, (b) the calling site repo;
   installs Node + headless Chromium + the Indic fonts.
4. `gen.js` **loops over `config.feeds[]`**. For each feed:
   a. resolve the day's verse via `order/<site>.<feed>.json` (`daysSince(epoch) % N`);
   b. load that verse via the feed's `source` + `fieldMap`;
   c. Puppeteer opens `render.html`, draws header/logo → the `sections` (resolved through
      `fieldMap`, missing fields skipped) → footer → screenshots → `daily/<feed>/today.png`;
   d. write `daily/<feed>/today.txt` (caption) + `today.log`;
   e. push a dated copy to `samskruti-archives/<archivePath>/YYYYMMDD/`.
5. Commit all `daily/*/today.*` to the SITE repo (overwrite).
6. Site's Pages deploy serves the refreshed `/daily/<feed>` pages.

GitHub cron is not exact (drift 5–15 min, rarely skipped). Fine for a daily card.

---

## 3. `config.json` schema (per site)

```jsonc
{
  "site": "samskruti",
  "link": "https://samskruti.info",

  // ── card chrome shared by all feeds (a feed may override any of these) ──
  "card": {
    "logo":   { "src": "daily/assets/om.png", "position": "header-left" },
    "header": { "heading": "{source}", "align": "center" },
    "footer": { "left": "సంస్కృతిః", "right": "samskruti.info" },  // te/sa brand · URL
    "theme":  { "template": "palm-leaf", "accent": "#c8a84b" }
  },

  "selection": { "mode": "rotation", "epoch": "2026-07-23" },
  "archive":   { "repo": "yourname/samskruti-archives" },
  "timezone":  { "name": "Australia/Sydney", "hour": 4 },  // gen.js gates on this (§8)

  // ── one entry per independent daily feed / group ──
  "feeds": [
    {
      "id": "subhashitam",
      "source": {
        "glob":   "data/subhashitam/**/*.json",
        "filter": "has:meaning.te"           // only verses that have a meaning
      },
      "fieldMap": {
        "verse":   "shlokam.te",
        "meaning": "meaning.te",
        "source":  "granthaH.name_en"
      },
      "sections": ["verse", "meaning", "source"],
      "caption":  "{verse}\n\n{meaning}\n\n— {source}\n🌸 {link}",
      "output":      "daily/subhashitam/",
      "archivePath": "samskruti/subhashitam",
      "telegram":    { "enabled": false, "chatIds": [], "tokenSecret": "TELEGRAM_TOKEN" }
    },
    {
      "id": "yogasutra",
      "source":   { "glob": "data/yoga-sutras/**/*.json" },
      "fieldMap": { "verse": "sutra.sa", "meaning": "meaning.te", "source": "reference" },
      "sections": ["verse", "meaning", "source"],
      "caption":  "{verse}\n\n{meaning}\n\n— {source}\n🕉 {link}",
      "output":      "daily/yogasutra/",
      "archivePath": "samskruti/yogasutra",
      "telegram":    { "enabled": false, "chatIds": [] }
    }
    // "stotram" feed added later — see §4 note (meanings are separate _meaning_<lang>.txt)
  ]
}
```

### smruti feed example (has word-by-word)
```jsonc
{
  "id": "gita",
  "source":   { "glob": "data/gita/**/*.json" },
  "fieldMap": {
    "verse":      "shloka.devanagari",
    "wordbyword": "anvaya.wordmeanings",     // ← slot samskruti lacks
    "meaning":    "translation.te",
    "source":     "reference"
  },
  "sections": ["verse", "wordbyword", "meaning", "source"],
  "caption":  "{verse}\n\n{wordbyword}\n\n{meaning}\n\n— {source}\n{link}",
  "output":      "daily/gita/",
  "archivePath": "smruti/gita"
}
```

**Caption = Full style** (verse + meaning + source + URL). Rendered sample:
```
शैले शैले न माणिक्यं मौक्तिकं न गजे गजे ।
साधवो नहि सर्वत्र चन्दनं न वने वने ॥

Not every mountain holds a gem, nor every elephant a pearl;
the noble are not everywhere, nor sandalwood in every forest.

— Cāṇakya Nīti
🌸 samskruti.info
```

---

## 4. Section system (schema-independent)

- Each **section type** = a small draw fn in `src/sections/` (`verse.js`, `wordbyword.js`,
  `meaning.js`, `source.js`, plus chrome: `header.js`, `footer.js`, `logo.js`).
- `render.html` draws: **logo → header** → each `feed.sections` (resolved via `fieldMap`;
  **missing field → skipped**) → **footer**.
- New *kind* of section = add one file in `sections/`, then list it in a feed's
  `sections`. Code change once; config-only thereafter.

**Header / footer / logo are configurable sections** driven by `card` (or per-feed
override): logo image + position, header heading (supports `{slot}` tokens like
`{source}`), footer left/right text.

**stotram feed note:** stotram shlokas keep their meanings in separate
`data/stotram/<slug>/<slug>_meaning_<lang>.txt` files (per section), not one JSON. So the
`stotram` feed needs a small **source adapter** that enumerates only shlokas which have a
matching meaning line, and pairs shloka↔meaning. Build subhāṣitam + yogasutra first
(per-verse JSON, trivial); add the stotram adapter as a second step.

---

## 5. Installing on a new site (one-time)

From central, targeting a local site checkout:
```bash
# from samskruti-archives/daily-tool/
./install.sh --site samskruti --target ../../claude/samskruti
```
It copies/creates in the target site:
- `.github/workflows/daily.yml` — the caller (§6)
- `daily/config.json` — template to fill (feeds + card + selection + archive)
- `daily/index.html`, `daily/daily.css`, `daily/daily.js`, `daily/assets/` — viewing page
- prints the **manual steps** (§10).

Re-running `install.sh` later **re-syncs the viewing page** if it changed centrally; it
never overwrites `config.json`. It also generates `order/<site>.<feed>.json` for any feed
that lacks one (shuffled once from that feed's verse-id list).

---

## 6. Caller workflow (lives in each site)

```yaml
# .github/workflows/daily.yml
name: Daily verse card
on:
  schedule:
    - cron: "0 17 * * *"   # 4 AM AEDT / 5 AM AEST  }  gen.js runs only if it is
    - cron: "0 18 * * *"   # 4 AM AEST / 5 AM AEDT  }  ~4 AM Australia/Sydney (§8)
  workflow_dispatch: {}     # manual "run now" (ignores the time gate)
jobs:
  daily:
    if: ${{ hashFiles('daily/config.json') != '' }}   # no-op if daily/ removed
    uses: yourname/samskruti-archives/.github/workflows/daily-reusable.yml@main
    with:
      config: daily/config.json
    secrets:
      ARCHIVE_TOKEN:  ${{ secrets.ARCHIVE_TOKEN }}
      TELEGRAM_TOKEN: ${{ secrets.TELEGRAM_TOKEN }}   # optional, later
```
Pin `@main` for auto-updates, or `@v1` to freeze a version.

---

## 7. Updating the tool (propagation model)

| Change | How sites get it |
|---|---|
| Generator code (`gen.js`, `sections/*`, `renderer.js`) | **Automatic** next run (checked out from central at run time) |
| Reusable workflow | **Automatic** (sites reference `@main`) |
| Viewing page (`site-assets/*`) | Re-run `install.sh` per site (or a dispatch workflow that opens sync PRs) |
| A site's feeds / sections / caption / chrome | Edit that site's `daily/config.json` — no central change |

Day-to-day + per-site changes are **config-only**; central code updates propagate by
themselves. Only the served viewing page needs an explicit re-sync.

---

## 8. Run time — 4 AM Australia/Sydney, year-round

GitHub cron is **UTC and ignores DST**; Sydney switches AEST(UTC+10)↔AEDT(UTC+11). To hit
4 AM every day:
- Schedule **two** UTC crons: `0 17 * * *` and `0 18 * * *` (one is 4 AM in each DST state).
- `gen.js` computes the current `Australia/Sydney` hour and **exits immediately unless it
  is `config.timezone.hour` (4)**. Idempotent: only one of the two daily triggers proceeds.

Optional guard: gen.js can also skip if today's `today.png` was already produced (so a
re-run never double-posts).

---

## 9. Verse selection (deterministic, no repeats)

`order/<site>.<feed>.json` is a **fixed shuffled list** of that feed's verse IDs, generated
once (by `install.sh` or a helper). `index = daysSince(config.selection.epoch) % N`
(epoch = **2026-07-23**) walks it in order — every verse appears once before any repeat,
and the same date always yields the same verse. Regenerating reshuffles (use rarely).

---

## 10. Manual setup checklist (one-time)

Per site (GitHub web UI):
1. Repo → Settings → Actions → Workflow permissions → **Read and write**.
2. Create a **fine-grained PAT** with `contents:write` on `samskruti-archives`; add it as
   secret **`ARCHIVE_TOKEN`** in the site repo.
3. Run `install.sh`, then fill `daily/config.json` (feeds, chrome, archive).
4. (Optional, later) add secret **`TELEGRAM_TOKEN`** and set each feed's `telegram.enabled`.

Central repo (once): create `.github/workflows/daily-reusable.yml`, `daily-tool/` (done),
and the `samskruti/` + `smruti/` output folders (done).

---

## 11. Telegram (next iteration — extension point, not yet built)

`gen.js`'s per-feed loop ends with a `publish` step. Today it writes files only. Next
iteration: if `feed.telegram.enabled`, read `TELEGRAM_TOKEN` (secret) + `feed.telegram.chatIds`
(config) and POST `today.png` + caption to each chat via the Telegram Bot API — official,
free, posts to groups/channels. Because feeds are independent, the Yoga Sūtras feed posts
to the yoga group and subhāṣitam to its group automatically. No Part-1 rework.

---

## 12. Removing the feature (per site)

Delete `daily/` and `.github/workflows/daily.yml`. The caller's `if:` guard means a stray
workflow no-ops. Nothing else in the site references it.

---

## 13. Caveats

- **Fonts**: headless Chromium needs Tiro Devanagari / Noto Sans Telugu installed in the
  runner (the reusable workflow does this) or Indic text renders as boxes.
- **Cron timing**: not exact; acceptable for a daily card. The two-cron + Sydney-hour gate
  (§8) keeps it at 4 AM across DST.
- **Secrets**: `ARCHIVE_TOKEN` / `TELEGRAM_TOKEN` are GitHub Secrets — never in the repo.
- **Duplication**: none for the generator (one copy, called by all sites). Only the small
  viewing page is copied per site.
- **Renderer**: the daily card is a *vendored* copy of the palm-leaf design
  (`design/palm-leaf-card.html` → `src/renderer.js`), self-contained so the tool has no
  runtime dependency on any site's `share-card.js`. If you redesign the live card, port the
  change here too.
- **Rendering engine**: `gen.js` drives the system Chrome/Chromium in headless mode to
  screenshot the card (same engine as Puppeteer, no npm dependency). It polls for the PNG
  and kills the browser once it's stable — do **not** add `--virtual-time-budget` (it hangs).

---

## 14. Corpus layouts & field mapping

Every corpus has a different shape; the loader (`src/lib/data.js`) absorbs that so a new
feed is config-only. A feed's `source` describes the file layout and `fieldMap` says where
each slot lives:

| `source.records` | file layout | example corpus |
|---|---|---|
| *(omitted)* / `"file"` | one record per JSON file | subhāṣitam, v-dindhima |
| `"array"` | the file is an array of records | yoga-sūtras (per-pāda files) |
| `"array:<path>"` | records are an array at a dot-path | BG (`shlokas`), VSN (`shlokas`) |
| `"adapter": "<name>"` | custom loader in `src/lib/adapters/` | stotram (`.txt` + `_meaning_<lang>.txt`) |

`fieldMap` values are dot-paths, or an **array of paths** joined with `\n` (used to assemble
a multi-pāda verse, e.g. `"verse": ["p1.te","p2.te","p3.te","p4.te"]`). `source.idField`
(string or array) gives a stable id; array records are keyed `<file>#<id-or-index>`.
Per-feed `script` (`te`|`sa`|`iast`) selects the verse script. Missing fields / unknown
section types are skipped, so adding sections or feeds never breaks a run.

**Adding a corpus with a new layout** = one small file in `src/lib/adapters/` returning
`{ id, file, rec }[]` (see `stotram.js`), referenced by `source.adapter`. Nothing else
changes.

## 15. Testing locally

`test/run.js` renders one card per scenario against the real corpora and asserts each
produces a valid PNG — run it after touching the loader, sections, or renderer.

```bash
node test/run.js                 # all scenarios (subhashitam, dindima, yogasutra,
                                 # stotram, bg, vsn, resilience)
node test/run.js bg vsn          # only the named ones
# corpus roots default to sibling repos; override if needed:
SAMSKRUTI_DATA=/path/to/samskruti SMRUTI_DATA=/path/to/smruti node test/run.js
```

Output PNGs land in `.local/test-out/<scenario>/` for eyeballing. `.local/` is a
git-ignored scratch area (local test data copies + outputs) — nothing in it is committed.
`test/config.*.json` are working references for every supported layout.
```
