import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';

import { getCreationUnits } from '../../app/lib/metric-calcs.js';

let parcel;
let bngResult;

// function to round to 2 decimal places
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

Given('an Invalid type parcel of 0.5 Ha and Moderate condition, for creation', function () {
  parcel = { areaHa: 0.5, habitat: 'Invalid - Invalid type', condition: 'Moderate', delayYears:0, advanceYears:0 };
});

When('calculating BNG units', function () {
  
  try {
    bngResult = getCreationUnits(parcel.areaHa, parcel.habitat, parcel.condition, parcel.delayYears, parcel.advanceYears)  
  } catch (error) {
    this.error = error
  }
});

Then('I should receive an error', function () {
  if (!this.error) {
    throw new Error('No error captured');
  }
});

Given('a Reedbeds parcel parcel of 0.0 Ha and Moderate condition, for creation', function () {
  parcel = { areaHa: 0.0, habitat: 'Wetland - Reedbeds', condition: 'Moderate', delayYears:0, advanceYears:0 };
});

