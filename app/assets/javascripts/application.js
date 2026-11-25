//
// For guidance on how to add JavaScript see:
// https://prototype-kit.service.gov.uk/docs/adding-css-javascript-and-images
//

window.GOVUKPrototypeKit.documentReady(() => {
  // Baseline column filter (project-dashboard-v4). MOJ Frontend's initAll()
  // doesn't start the filter's toggle button, so start it here. It adds
  // "Show filter" / "Hide filter" to the action bar and starts closed unless
  // the filter has data-start-hidden="false" (just after applying).
  const MOJFrontend = window.MOJFrontend
  if (MOJFrontend && MOJFrontend.FilterToggleButton) {
    document
      .querySelectorAll('.app-column-filter [data-module="moj-filter"]')
      .forEach(($filter) => {
        new MOJFrontend.FilterToggleButton($filter, {
          bigModeMediaQuery: '(min-width: 64.0625em)',
          toggleButton: {
            showText: 'Show filter',
            hideText: 'Hide filter',
            classes: 'govuk-button--secondary govuk-!-margin-bottom-3'
          },
          toggleButtonContainer: {
            element: $filter
              .closest('.app-column-filter')
              .querySelector('.moj-action-bar__filter')
          }
        })
      })
  }
})
