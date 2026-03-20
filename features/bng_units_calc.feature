Feature: Calculate BNG Units

  Scenario: Calculate baseline units
    Given a Modified Grassland parcel of 1.36 Ha and Moderate condition 
    When calculating Baseline BNG units
    Then the returned value should be 5.44

  Scenario: Calculate baseline units
    Given a Mixed scrub parcel of 0.057 Ha and Poor condition 
    When calculating Baseline BNG units
    Then the returned value should be 0.23

  Scenario: Calculate baseline units
    Given a Developed land; sealed surface parcel of 0.072 Ha and N/A - Other condition 
    When calculating Baseline BNG units
    Then the returned value should be 0.00

  Scenario: Calculate baseline units
    Given a Cereal crops parcel of 4.52 Ha and Condition Assessment N/A condition 
    When calculating Baseline BNG units
    Then the returned value should be 9.04

  Scenario: Calculate baseline units
    Given a Native pine woodlands parcel of 12.154 Ha and Moderate condition
    When calculating Baseline BNG units
    Then the returned value should be 145.85

  Scenario: Calculate baseline units
    Given a Coastal lagoons parcel of 3.843 Ha and Poor condition 
    When calculating Baseline BNG units
    Then the returned value should be 23.06

  Scenario: Calculate enhancement units
    Given a Native pine woodlands parcel of 12.154 Ha and Good condition for enhancement 
    When calculating Enhancement BNG units
    Then the returned value should be 159.95

  # Vegetated garden parcel has a Poor condition of "Not Possible" so time to target defaults to 1? 
  Scenario: Calculate created units
    Given a Vegetated garden parcel (Poor condition is Not Possible) of 4 Ha and Condition Assessment N/A condition for creation
    When calculating Creation BNG units
    Then the returned value should be 7.72

  Scenario: Calculate created units
    Given a Developed land; sealed surface parcel of 5.6 Ha and N/A - Other condition for creation
    When calculating Creation BNG units
  Then the creation value should be 0.00

  # Spreadsheet gives slightly different value (9.09) to the spreadsheet because the Time To Target value is 0.410377 instead of the correct 0.41
  Scenario: Calculate created units
    Given a Lowland mixed deciduous woodland parcel of 5.6 Ha and Moderate condition with 5 years created in advance, for creation
    When calculating Creation BNG units
    Then the returned value should be 9.10

  Scenario: Calculate created units
    Given a Vegetated garden parcel of 4 Ha and Condition Assessment N/A condition with 2 years delay, for creation
    When calculating Creation BNG units
    Then the returned value should be 7.19

  # Test Time To Target 30+ years - note that the spreadsheet value of 6.66 is wrong (should be 6.67)  
  # due to a Final time to target multiplier of 0.3197967361 rather than 0.320
  Scenario: Calculate created units
    Given an Inland rock outcrop and scree habitats parcel of 5.26 Ha and Moderate condition with 12 years delay, for creation
    When calculating Creation BNG units
    Then the returned value should be 6.66

  # Test Time To Target <0 years
  Scenario: Calculate created units
    Given a Reedbeds parcel of 1.62 Ha and Moderate condition with 8 years in advance, for creation
    When calculating Creation BNG units
    Then the returned value should be 19.44

  Scenario: Invalid habitat
    Given an Invalid type parcel of 0.5 Ha and Moderate condition, for creation
    When calculating BNG units
    Then I should receive an error

  Scenario: Invalid size
    Given a Reedbeds parcel parcel of 0.0 Ha and Moderate condition, for creation
    When calculating BNG units
    Then I should receive an error