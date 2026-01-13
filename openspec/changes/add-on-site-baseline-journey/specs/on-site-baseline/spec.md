## ADDED Requirements

### Requirement: Upload Choice Page
The system SHALL provide a page at `/on-site-baseline/start` that allows users to choose how they want to add their habitat data. The page MUST display three radio button options: single file upload, separate file uploads, or drawing on a map. On form submission, the system SHALL redirect to the appropriate next page based on the selected option.

#### Scenario: User selects single file upload
- **WHEN** user selects "I have one file with boundary and habitat parcels" and clicks Continue
- **THEN** user is redirected to `/on-site-baseline/upload-single-file`

#### Scenario: User selects separate files option
- **WHEN** user selects "I have separate files for boundary and parcels" and clicks Continue
- **THEN** user is redirected to `/on-site-baseline/upload-boundary` (future implementation)

#### Scenario: User selects no files option
- **WHEN** user selects "I don't have GIS files" and clicks Continue
- **THEN** user is redirected to `/on-site-baseline/draw-map` (future implementation)

#### Scenario: No option selected
- **WHEN** user clicks Continue without selecting an option
- **THEN** the page displays a validation error message

---

### Requirement: Single File Upload Page
The system SHALL provide a page at `/on-site-baseline/upload-single-file` that allows users to upload a single GeoPackage file containing both site boundary and habitat parcel layers. The page MUST accept `.gpkg` files only.

#### Scenario: Valid GeoPackage uploaded
- **WHEN** user uploads a valid `.gpkg` file containing boundary and parcel layers
- **THEN** the system parses the file, extracts layer information, stores data in session, and redirects to `/on-site-baseline/confirm-layers`

#### Scenario: Invalid file type uploaded
- **WHEN** user uploads a file that is not a `.gpkg` file
- **THEN** the page displays a validation error indicating only GeoPackage files are accepted

#### Scenario: No file selected
- **WHEN** user clicks Upload without selecting a file
- **THEN** the page displays a validation error message

#### Scenario: Corrupted or unreadable GeoPackage
- **WHEN** user uploads a `.gpkg` file that cannot be parsed
- **THEN** the page displays an error message indicating the file could not be read

---

### Requirement: Confirm Layers Page
The system SHALL provide a page at `/on-site-baseline/confirm-layers` that displays a summary of the uploaded GeoPackage contents, including detected layers, polygon counts, areas, and a map preview of the geometries.

#### Scenario: Successful layer detection displayed
- **WHEN** user arrives at the confirm layers page after successful upload
- **THEN** the page displays a success notification banner, a summary list showing site boundary and habitat parcel layer details, and a map preview showing the uploaded geometries

#### Scenario: Map preview shows uploaded geometries
- **WHEN** the confirm layers page loads
- **THEN** the map component displays the site boundary in red dashed outline and habitat parcels as filled polygons, using the DefraMapClient library

#### Scenario: Location information displayed
- **WHEN** user views the confirm layers page
- **THEN** the page displays mock location information including Local Planning Authority, National Character Area, and Local Nature Recovery Strategy names

#### Scenario: User confirms and continues
- **WHEN** user clicks the Continue button
- **THEN** user is redirected to the habitats summary page (future implementation)

---

### Requirement: GeoPackage Parsing API
The system SHALL provide server-side functionality to parse uploaded GeoPackage files and extract layer information including layer names, geometry types, polygon counts, and GeoJSON representations of the geometries.

#### Scenario: Layer discovery from GeoPackage
- **WHEN** a GeoPackage file is uploaded
- **THEN** the system reads the `gpkg_contents` table to identify available layers and their types

#### Scenario: Geometry extraction
- **WHEN** a layer is identified as containing polygon geometries
- **THEN** the system extracts the geometries as GeoJSON and calculates the total area in hectares

#### Scenario: Session storage of parsed data
- **WHEN** a GeoPackage is successfully parsed
- **THEN** the layer information and GeoJSON geometries are stored in the user's session for use in subsequent pages

---

### Requirement: Journey Navigation
The system SHALL provide a link to the On-Site Baseline journey from the application's home page, allowing users to easily access the new upload workflow.

#### Scenario: Navigation link visible
- **WHEN** user views the application home page
- **THEN** a link or button to start the On-Site Baseline journey is visible

#### Scenario: Navigation link works
- **WHEN** user clicks the On-Site Baseline journey link
- **THEN** user is navigated to `/on-site-baseline/start`
