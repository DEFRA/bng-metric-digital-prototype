## ADDED Requirements

### Requirement: In-place dashboard map view switching

The system SHALL allow a user to switch between uploaded baseline and post-intervention dashboard map views without reloading the page. The displayed datasets, map information panel, feature interactions, filters, extent, selected radio, and URL MUST represent the active view.

#### Scenario: Switch to post-intervention

- **WHEN** baseline and post-intervention data are available and the user selects Post intervention
- **THEN** the map replaces the displayed datasets with post-intervention data without reloading the document
- **AND** the map panel, controls, extent, and URL identify the post-intervention view

#### Scenario: Switch to baseline

- **WHEN** post-intervention data is displayed and the user selects Baseline
- **THEN** the map replaces the displayed datasets with baseline data without reloading the document
- **AND** post-intervention-only controls and feature filters do not affect the baseline data

#### Scenario: View is unavailable

- **WHEN** map data for a view has not been uploaded
- **THEN** that view's radio control is disabled
- **AND** the client does not request that view

#### Scenario: View loading fails

- **WHEN** loading a selected view fails
- **THEN** the current map data and active view remain unchanged
- **AND** the user is informed that the selected view could not be loaded

#### Scenario: Navigate through view history

- **WHEN** the user navigates Back or Forward after switching map views
- **THEN** the map switches to the view represented by the browser history entry without reloading the document
