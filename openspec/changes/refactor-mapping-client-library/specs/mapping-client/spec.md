## ADDED Requirements

### Requirement: Mapping client library as a class-based API
The system SHALL provide a reusable client-side mapping library implemented as a class-based API that can be loaded via browser `<script>` tags without relying on JavaScript modules or bundlers.

#### Scenario: Library is instantiated on a map page
- **WHEN** a page includes the mapping library script and constructs the public parent class
- **THEN** the map SHALL initialize successfully (tiles + overlay layers)
- **AND** the library SHALL expose its features via methods and events

### Requirement: Configurable backend and external resource URLs
The mapping library SHALL accept configuration parameters that define the URLs for backend resources and external map resources, and SHALL NOT hard-code application-specific endpoints.

#### Scenario: A client provides custom endpoints
- **WHEN** a client configures the library with custom URLs for loading/saving geometries and OS proxy routes
- **THEN** the library SHALL use those URLs for network calls

### Requirement: BNG-agnostic mapping functionality
The mapping library SHALL implement only generic mapping features and SHALL NOT include BNG habitat attribution logic or enforce any parcel metadata schema.

#### Scenario: Habitat attribution is excluded from the mapping library
- **WHEN** a client uses the mapping library
- **THEN** the library SHALL NOT require habitat attribution scripts to function
- **AND** the library SHALL provide hooks for clients to attach their own per-feature metadata

### Requirement: Hooks for client integration
The mapping library SHALL expose hooks/events that enable clients to integrate custom behaviour, including responding to polygon clicks and lifecycle events for drawing, fill, and slice actions.

#### Scenario: Client listens for polygon click events
- **WHEN** a user clicks a drawn polygon (boundary or parcel)
- **THEN** the library SHALL emit an event containing enough information for the client to identify the clicked feature

### Requirement: Programmatic map interactions
The mapping library SHALL expose methods to programmatically trigger mapping interactions, including zooming and fill-related actions.

#### Scenario: Client triggers zoom programmatically
- **WHEN** a client calls a zoom method on the library
- **THEN** the map view SHALL update accordingly

### Requirement: Read-only area measurements in square meters
The mapping library SHALL expose read-only area measurement properties in **square meters** for relevant geometries (boundary, current parcel, selection, totals) so clients can format and convert units (for example to hectares).

#### Scenario: Client reads area in square meters
- **WHEN** a boundary or parcel geometry is updated
- **THEN** the library SHALL provide the updated area value in square meters via a read-only property or getter

