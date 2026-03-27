import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';

import { getBaselineUnits } from '../../app/lib/metric-calcs.js';

let parcel;
let bngResult;

// function to round to 2 decimal places
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

Given('a Modified Grassland parcel of 1.36 Ha and Moderate condition', function () {
  parcel = { areaHa: 1.36, habitat: 'Grassland - Modified grassland', condition: 'Moderate' };
});

When('calculating Baseline BNG units', function () {
  bngResult = getBaselineUnits(parcel.habitat, parcel.areaHa, parcel.condition);
});

Then('the BNG units should be 5.44', function () {
  assert.strictEqual(round2(bngResult), 5.44);
});

Given('a Mixed scrub parcel of 0.057 Ha and Poor condition', function () {
  parcel = { areaHa: 0.057, habitat: 'Heathland and shrub - Mixed scrub', condition: 'Poor' };
});

Then('the BNG units should be 0.23', function () {
  assert.strictEqual(round2(bngResult), 0.23);
});

Given('a Developed land; sealed surface parcel of 0.072 Ha and N\\/A - Other condition', function () {
  parcel = { areaHa: 0.072, habitat: 'Urban - Developed land; sealed surface', condition: 'N/A - Other' };
});

Then('the BNG units should be 0.00', function () {
  assert.strictEqual(round2(bngResult), 0.00);
});

Given('a Cereal crops parcel of 4.52 Ha and Condition Assessment N\\/A condition', function () {
  parcel = { areaHa: 4.52, habitat: 'Cropland - Cereal crops', condition: 'Condition Assessment N/A' };
});

Then('the BNG units should be 9.04', function () {
  assert.strictEqual(round2(bngResult), 9.04);
});

Given('a Native pine woodlands parcel of 12.154 Ha and Moderate condition', function () {
  parcel = { areaHa: 12.154, habitat: 'Woodland and forest - Native pine woodlands', condition: 'Moderate' };
});

Then('the BNG units should be 145.85', function () {
  assert.strictEqual(round2(bngResult), 145.85);
});

Given('a Coastal lagoons parcel of 3.843 Ha and Poor condition', function () {
  parcel = { areaHa: 3.843, habitat: 'Coastal lagoons - Coastal lagoons', condition: 'Poor' };
});

Then('the BNG units should be 23.06', function () {
  assert.strictEqual(round2(bngResult), 23.06);
});

