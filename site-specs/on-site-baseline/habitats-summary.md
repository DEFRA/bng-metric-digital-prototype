On-site baseline habitats
Page ID

habitats-summary

Route

/on-site-baseline/habitats-summary

Purpose

Present a summary of on-site baseline information and list all identified habitat parcels so the user can begin adding habitat details for each parcel.

Page content

GovUK Caption (large)
On-site baseline

GovUK Heading (large)
On-site baseline habitats

GovUK Body
baselineSummary.parcelCountMessage

Summary information

GovUK Summary List

Site area: siteSummary.totalAreaHectares

Local Planning Authority: siteSummary.localPlanningAuthority

National Character Area: siteSummary.nationalCharacterArea

Custom component (non-GovUK): Map preview

Purpose: Visual overview of habitat parcels within the site boundary

Backing data:

mapData.parcels

mapData.siteBoundary

Habitat parcels

GovUK Heading (medium)
Habitat parcels

Custom component (non-GovUK): Parcel table

Columns:

Parcel reference

Area (hectares)

Habitat

Status

Action

Rows backed by:

habitatParcels[]

parcelId

areaHectares

habitatLabel

status

actionUrl

Supporting information

None.

Form

None.

Actions

GovUK Button
Label: Start adding habitat details
Action: Navigate to first habitat parcel detail step
Target: actions.startFirstParcel.url

Inline actions within parcel table

Link label: Add details

Action: Navigate to selected parcel’s habitat detail journey

Target: habitatParcels[].actionUrl

Data contract
Any read data can be stubbed into a corresponding GET route
Data required (read)
{
  "baselineSummary": {
    "parcelCountMessage": "string"
  },
  "siteSummary": {
    "totalAreaHectares": "string",
    "localPlanningAuthority": "string",
    "nationalCharacterArea": "string"
  },
  "mapData": {
    "siteBoundary": "GeoJSON",
    "parcels": "GeoJSON"
  },
  "habitatParcels": [
    {
      "parcelId": "string",
      "areaHectares": "string",
      "habitatLabel": "string | null",
      "status": "string",
      "actionUrl": "string"
    }
  ],
  "actions": {
    "startFirstParcel": {
      "url": "string"
    }
  }
}

Data written

None.

Navigation logic

Selecting Start adding habitat details navigates to the first incomplete habitat parcel.

Selecting Add details for a parcel navigates to that parcel’s habitat detail journey.

No conditional branching on this page.

Validation

Not applicable.

Accessibility notes

Summary list uses clear key–value associations for screen readers.

Table includes a visually hidden header for the action column to ensure context.

Map component must provide an accessible text alternative summarising parcel locations.

Focus order follows visual order: heading → summary → map → table → primary action.

Related specs

Habitat parcel detail – broad habitat selection

On-site baseline overview

Journey: on-site baseline habitat entry