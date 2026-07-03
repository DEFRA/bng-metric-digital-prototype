# Figma element → GOV.UK Design System mapping

A cheat-sheet for Step 4. Match each element you see in a screen's PNG to the closest component below,
import it at the top of the view (`{% from "..." import ... %}`), and render it in `{% block content %}`.

Most rows are stock `govuk-frontend` macros. The last two rows are **non-standard dashboard clusters
with no GDS equivalent** — they map to this repo's reusable macro at `app/views/dashboard/macro.njk`.

| Figma element                            | GDS component / macro                                                         | Import path                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Back link (top-left "‹ Back")            | `govukBackLink`                                                               | `govuk/components/back-link/macro.njk`                                           |
| Page caption + heading                   | `govuk-caption-xl` class + `govukHeadingXl` / `<h1 class="govuk-heading-xl">` | `govuk/components/...` (caption is a plain class span above the `h1`)            |
| Radio group (choose one)                 | `govukRadios`                                                                 | `govuk/components/radios/macro.njk`                                              |
| "or" / exclusive divider between options | `govukRadios` with a `{ divider: "or" }` item                                 | `govuk/components/radios/macro.njk`                                              |
| File upload control                      | `govukFileUpload`                                                             | `govuk/components/file-upload/macro.njk`                                         |
| Expandable "What is …?" / "Help with …"  | `govukDetails`                                                                | `govuk/components/details/macro.njk`                                             |
| Primary action button                    | `govukButton`                                                                 | `govuk/components/button/macro.njk`                                              |
| Secondary action ("Cancel", "Back")      | `govukButton` with `classes: "govuk-button--secondary"`                       | `govuk/components/button/macro.njk`                                              |
| Top service navigation bar               | `govukServiceNavigation`                                                      | `govuk/components/service-navigation/macro.njk` (already in `layouts/main.html`) |
| Data grid / table of rows                | `govukTable`                                                                  | `govuk/components/table/macro.njk`                                               |
| Key / value pairs ("check your answers") | `govukSummaryList`                                                            | `govuk/components/summary-list/macro.njk`                                        |
| Confirmation panel (big green "done")    | `govukPanel`                                                                  | `govuk/components/panel/macro.njk`                                               |
| Status pill / badge                      | `govukTag` (`--green` complete, `--yellow` in progress, `--red` problem)      | `govuk/components/tag/macro.njk`                                                 |
| Notification / banner message            | `govukNotificationBanner`                                                     | `govuk/components/notification-banner/macro.njk`                                 |
| **Metric / stat card + big number**      | **`appDashboard`** (repo macro — non-standard, no GDS equivalent)             | `dashboard/macro.njk`                                                            |
| **Left / side sub-navigation**           | **`appSideNav`** (repo macro — non-standard, no GDS equivalent)               | `dashboard/macro.njk`                                                            |

## Notes

- The service navigation and page header live in `app/views/layouts/main.html`, so a view that
  `{% extends "layouts/main.html" %}` already renders them — don't re-add them per screen.
- Standard GOV.UK pages sit inside `govuk-grid-row` → `govuk-grid-column-two-thirds`. Dashboards that
  need the full width use `govuk-grid-column-full` (see the dashboard macro's own layout guidance).
- Colour-code tags to the status word in the design: green = complete/success, yellow/orange = in
  progress/pending, red = error/problem.
- Import **only** the macros a given screen uses — keep each view's import block tight.
