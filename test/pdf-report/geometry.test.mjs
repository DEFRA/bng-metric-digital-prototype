/**
 * Areas are printed as key figures, on habitat cards and in the map
 * alternative text, so a polygon with a hole has to measure the ground it
 * actually covers rather than the extent of its outline.
 *
 * Coordinates are metres on the EPSG:27700 grid, so every expected value here
 * is worked out by hand from the side lengths.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { polygonAreaSqm } from '../../app/lib/pdf-report/geometry.mjs'

/** A closed axis-aligned ring, anticlockwise from its bottom-left corner. */
const square = (x, y, side) => [
  [x, y],
  [x + side, y],
  [x + side, y + side],
  [x, y + side],
  [x, y]
]

/** The same ring wound the other way, which GeoJSON does not forbid. */
const reversed = (ring) => [...ring].reverse()

const polygon = (...rings) => ({ type: 'Polygon', coordinates: rings })
const multiPolygon = (...polygons) => ({
  type: 'MultiPolygon',
  coordinates: polygons
})

test('a simple polygon is its exterior area', () => {
  assert.equal(polygonAreaSqm(polygon(square(0, 0, 100))), 10_000)
})

test('a polygon with a hole has the hole subtracted', () => {
  const withHole = polygon(square(0, 0, 100), square(25, 25, 50))

  // 100m square (10,000 m²) less a 50m square pond (2,500 m²).
  assert.equal(polygonAreaSqm(withHole), 7_500)
})

test('a polygon with several holes has all of them subtracted', () => {
  const withHoles = polygon(
    square(0, 0, 100),
    square(10, 10, 20),
    square(50, 50, 30)
  )

  assert.equal(polygonAreaSqm(withHoles), 10_000 - 400 - 900)
})

test('holes are subtracted whichever way the rings are wound', () => {
  const expected = 7_500

  for (const [label, geometry] of [
    ['both anticlockwise', polygon(square(0, 0, 100), square(25, 25, 50))],
    ['hole reversed', polygon(square(0, 0, 100), reversed(square(25, 25, 50)))],
    [
      'exterior reversed',
      polygon(reversed(square(0, 0, 100)), square(25, 25, 50))
    ],
    [
      'both reversed',
      polygon(reversed(square(0, 0, 100)), reversed(square(25, 25, 50)))
    ]
  ]) {
    assert.equal(polygonAreaSqm(geometry), expected, label)
  }
})

test('every polygon in a MultiPolygon has its own holes subtracted', () => {
  const parcels = multiPolygon(
    [square(0, 0, 100), square(25, 25, 50)], // 10,000 - 2,500
    [square(500, 500, 60)], // 3,600, no hole
    [square(1000, 1000, 40), square(1010, 1010, 20)] // 1,600 - 400
  )

  assert.equal(polygonAreaSqm(parcels), 7_500 + 3_600 + 1_200)
})

test('a hole larger than its exterior ring does not produce a negative area', () => {
  // Invalid geometry, but it must not print a negative figure on a report.
  const inverted = polygon(square(0, 0, 10), square(-50, -50, 200))

  assert.equal(polygonAreaSqm(inverted), 0)
})

test('non-polygon and missing geometry measure zero', () => {
  assert.equal(polygonAreaSqm(null), 0)
  assert.equal(polygonAreaSqm(undefined), 0)
  assert.equal(polygonAreaSqm({ type: 'LineString', coordinates: [] }), 0)
  assert.equal(polygonAreaSqm(polygon()), 0)
})
