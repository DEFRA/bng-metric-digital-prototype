import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';

import { getEnhancementUnits } from '../../app/lib/metric-calcs.js';

let parcel;
let bngResult;

// function to round to 2 decimal places
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

Given('a Native pine woodlands parcel of 12.154 Ha and Good condition for enhancement', function () {
  parcel = { areaHa: 12.154, habitat: 'Woodland and forest - Native pine woodlands', condition: 'Good', delayYears:0, advanceYears:0 };
});

When('calculating Enhancement BNG units', function () {
  bngResult = getEnhancementUnits(parcel.habitat, "Moderate", parcel.habitat, parcel.areaHa, parcel.condition, parcel.delayYears, parcel.advanceYears)
});

Then('the BNG units should be 159.95', function () {
  console.log(bngResult);
  assert.strictEqual(round2(bngResult), 159.95);
});

