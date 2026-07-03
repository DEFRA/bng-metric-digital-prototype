---
name: figma-journey
description: >-
  Extract a clickable Figma prototype journey via the Figma REST API (not MCP) and reconstruct it
  as a functional GOV.UK Prototype Kit journey in this repo. Given a Figma prototype URL (or
  fileKey#node-id), it pulls the page's frames, the wired click-flow, and rendered PNGs, maps each
  screen to GOV.UK Design System components, and scaffolds routes + views + a homepage link. Use when
  asked to turn a Figma prototype/frame into a working prototype journey, recreate a Figma flow, or
  add a new User Research journey from a design. Requires a read-only FIGMA_TOKEN in the environment.
userInvocable: true
arguments: Figma prototype URL (figma.com/proto/<key>?node-id=<a-b>) or "<fileKey>#<a:b>"
---

# Figma journey → GOV.UK Prototype Kit journey

Turn a clickable Figma prototype into a working GOV.UK Prototype Kit journey in this repo. The skill
talks to the **Figma REST API directly** (no Figma MCP): it pulls a page's screen frames, the wired
prototype click-flow, and a rendered PNG per screen, then you map each screen to GOV.UK Design System
components and scaffold the routes + views so the flow actually clicks through at http://localhost:3000.
It is a User Research mock — screens are populated from static config, not real file parsing.

## Step 0 — Token gate

Confirm a read-only Figma token is on the environment before doing anything else:

```sh
printf '%s' "${FIGMA_TOKEN:-}" | wc -c
```

If that prints `0`, stop and show the user `references/setup.md` (how to create and export a token).
Do **not** proceed without a token, and never print or echo the token itself. Verify the token works:

```sh
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Figma-Token: $FIGMA_TOKEN" https://api.figma.com/v1/me
```

Expect `200`. `401` = bad/expired token, `403` = missing File-content read scope — see the
troubleshooting table in `references/setup.md`.

## Step 1 — Parse the Figma location

Accept either a prototype/file URL (`https://www.figma.com/proto/<KEY>?node-id=<A-B>`, also `/file/`
and `/design/`) or the compact `"<fileKey>#<A:B>"` form. Derive the **fileKey** and the **nodeId**,
converting the URL's hyphen node id (`3452-31002`) to the API's colon form (`3452:31002`). The scripts
below do this parsing for you — you can pass the raw URL straight through. If no node id is supplied,
the extractor falls back to the file's first page.

## Step 2 — Extract the flow

```sh
node .claude/skills/figma-journey/scripts/figma-extract.mjs "<url-or-key#node>"
```

Writes `.tmp/figma-journey/<fileKey>/`:

- `page.json` — the raw Figma node tree (for reference / re-use).
- `flow.json` — machine-readable: `{ fileKey, nodeId, startNodeId, screens[], transitions{ onPage, offPage } }`.
- `flow.md` — human-readable: a table of screens (id / name / size), the flow starting point, the
  on-page transitions as `"<fromName>" (fromId) → <toScreenName> (toId)`, and a separate
  "Off-page / library links (ignore)" list (destinations that point at shared library components, not
  screens on this page).

**Read `flow.md`.** It is your map of the journey — which screens exist and which element clicks lead
where. Ignore the off-page/library links; they are not part of this journey.

## Step 3 — Render screens

```sh
node .claude/skills/figma-journey/scripts/figma-images.mjs "<url-or-key#node>"
```

Downloads one PNG per screen frame into the same working dir as `screen-<frameName>.png` (it reuses
`flow.json`/`page.json` from Step 2 rather than re-fetching). **Read each PNG** to inspect the screen
visually — its layout, headings, inputs, tables, tags and buttons drive the component mapping.

## Step 4 — Map each screen to GDS

Use `references/gds-mapping.md`. Standard elements map to stock `govuk-frontend` macros (back link,
caption + heading, radios, file upload, details, buttons, service navigation, table, summary list,
panel, tag, notification banner). Non-standard "dashboard" clusters have **no GDS equivalent** and map
to this repo's reusable dashboard macro:

```njk
{% from "dashboard/macro.njk" import appDashboard, appSideNav %}
```

- metric / stat cards + big-number tiles → `appDashboard`
- left / side sub-navigation → `appSideNav`

> **IMPORTANT — reuse the existing dashboard component; do NOT recreate it.** A reusable,
> accessible, config-driven dashboard already exists in this repo — do not build a new card / stat-tile
> / side-nav component or hand-roll bespoke CSS for dashboards:
>
> - Macros: `app/views/dashboard/macro.njk` → `appDashboard` (metric cards, composite/`wide` cards with
>   summary rows, status pills via stock `govukTag`) and `appSideNav` (accessible `aria-current` sub-nav).
>   Import with `{% from "dashboard/macro.njk" import appDashboard, appSideNav %}`.
> - Styles: already in `app/assets/sass/application.scss` under the "App dashboard" block (GOV.UK
>   palette; no extra CSS needed).
> - Both are driven entirely by a JSON/JS config object. **Worked example to copy:** the `metric-results`
>   journey — see the config objects and `res.render(..., { resultsDashboard, sideNav, ... })` in
>   `app/routes/metric-results.js`, and their use in `app/views/metric-results/{summary,area-habitats}.html`.
> - If the design needs something the macro can't yet express, **extend the macro's params** (and its
>   sass block) rather than forking a new component — keep one dashboard implementation.

Match what you see in the PNG to the closest component, screen by screen.

## Step 5 — Reconstruct the journey

Pick a short kebab-case journey key (e.g. `dashboard-review`). Then:

1. **Routes** — create `app/routes/<journey>.js` exporting `register<Journey>Routes(router)`. Copy the
   shape of `app/routes/on-site-baseline.js` (CommonJS `require`, `router.get`/`router.post`,
   `res.render('<journey>/<screen>', data)`, `module.exports`). Wire each transition from `flow.md`:
   the element click's destination screen becomes the redirect / link target.
2. **Register** — add `const { register<Journey>Routes } = require('./routes/<journey>')` and the
   matching `register<Journey>Routes(router)` call in `app/routes.js`.
3. **Views** — create `app/views/<journey>/<screen>.html` per screen, each `{% extends "layouts/main.html" %}`
   with a `{% block content %}`. Import only the macros that screen needs. Follow an existing view such
   as `app/views/on-site-baseline/start.html` for structure (`{% set pageName %}`, grid columns, macros).
4. **Styles** — append any custom styles the design needs to `app/assets/sass/application.scss` (guard
   them under a clearly-commented block for this journey).
5. **Homepage** — add a launcher link to the new journey and a short User-Research purpose description
   to `app/views/index.html`.

This is a UR mock: populate any dashboards / tables / stats from a **static config object** in the
route file — do **not** parse real uploads or call live services. Follow the repo code style: no
semicolons, single quotes, no trailing commas, 2-space indent, brace every `if`/`for` body.

## Step 6 — Verify

```sh
npm run dev            # serves http://localhost:3000
npm run format:check   # prettier over **/*.{cjs,js,json,md}
```

Open the homepage, launch the new journey, and click through every screen. Confirm each transition
matches `flow.md` and each screen resembles its PNG. Fix any route wiring or view that diverges.

## Reusability

This skill is generic. Point it at **any** Figma prototype location (`figma.com/proto/...` URL or
`<fileKey>#<node>`) and choose **any** journey key — nothing here is specific to one prototype. The
`.tmp/figma-journey/<fileKey>/` working dir is keyed by file, so multiple prototypes coexist. Re-run
Steps 2–3 any time the Figma design changes to refresh the flow and screenshots.
