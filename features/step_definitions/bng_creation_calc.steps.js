import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';

import { getCreationUnits } from '../../app/lib/metric-calcs.js';

let parcel;
let bngResult;

// function to round to 2 decimal places
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

Given('a Vegetated garden parcel \\(Poor condition is Not Possible) of 4 Ha and Condition Assessment N\\/A condition for creation', function () {
  parcel = { areaHa: 4, habitat: 'Urban - Vegetated garden', condition: 'Condition Assessment N/A', delayYears:0, advanceYears:0 };
});

When('calculating Creation BNG units', function () {
  //bngResult = getCreationUnits(parcel.habitat, parcel.areaHa, parcel.condition, parcel.habitat, parcel.condition, parcel.delayYears, parcel.advanceYears)
  bngResult = getCreationUnits(parcel.areaHa, parcel.habitat, parcel.condition, parcel.delayYears, parcel.advanceYears)
});

Then('the returned value should be 7.72', function () {
  assert.strictEqual(round2(bngResult), 7.72);
});

Given('a Developed land; sealed surface parcel of 5.6 Ha and N\\/A - Other condition for creation', function () {
  parcel = { areaHa: 5.6, habitat: 'Urban - Developed land; sealed surface', condition: 'N/A - Other', delayYears:0, advanceYears:0 };
});

Then('the creation value should be 0.00', function () {
  assert.strictEqual(round2(bngResult), 0.00);
});

Given('a Lowland mixed deciduous woodland parcel of 5.6 Ha and Moderate condition with 5 years created in advance, for creation', function () {
  parcel = { areaHa: 5.6, habitat: 'Woodland and forest - Lowland mixed deciduous woodland', condition: 'Moderate', delayYears:0, advanceYears:5 };
});

Then('the returned value should be 9.10', function () {
  assert.strictEqual(round2(bngResult), 9.10);
});

Given('a Vegetated garden parcel of 4 Ha and Condition Assessment N\\/A condition with 2 years delay, for creation', function () {
  parcel = { areaHa: 4, habitat: 'Urban - Vegetated garden', condition: 'Condition Assessment N/A', delayYears:2, advanceYears:0 };
});

Then('the returned value should be 7.19', function () {
  assert.strictEqual(round2(bngResult), 7.19);
});

Given('an Inland rock outcrop and scree habitats parcel of 5.26 Ha and Moderate condition with 12 years delay, for creation', function () {
  parcel = { areaHa: 5.26, habitat: 'Sparsely vegetated land - Inland rock outcrop and scree habitats', condition: 'Moderate', delayYears:12, advanceYears:0 };
});

Then('the returned value should be 6.66', function () {
  assert.strictEqual(round2(bngResult), 6.66);
});

Given('a Reedbeds parcel of 1.62 Ha and Moderate condition with 8 years in advance, for creation', function () {
  parcel = { areaHa: 1.62, habitat: 'Wetland - Reedbeds', condition: 'Moderate', delayYears:0, advanceYears:8 };
});

Then('the returned value should be 19.44', function () {
  assert.strictEqual(round2(bngResult), 19.44);
});
