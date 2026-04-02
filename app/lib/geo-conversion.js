import proj4 from 'proj4';

const EPSG27700 =
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 ' +
  '+x_0=400000 +y_0=-100000 +ellps=airy ' +
  '+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 ' +
  '+units=m +no_defs';

proj4.defs('EPSG:27700', EPSG27700);
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

function transformPosition(position) {
  if (!Array.isArray(position) || position.length < 2) {
    throw new Error('Invalid GeoJSON position');
  }

  const [x, y, ...rest] = position;
  const [lon, lat] = proj4('EPSG:27700', 'EPSG:4326', [x, y]);

  return [lon, lat, ...rest];
}

function transformCoordinates(coordinates) {
  if (!Array.isArray(coordinates)) {
    throw new Error('Invalid GeoJSON coordinates');
  }

  if (typeof coordinates[0] === 'number') {
    return transformPosition(coordinates);
  }

  return coordinates.map(transformCoordinates);
}

function transformGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') {
    throw new Error('Invalid GeoJSON geometry');
  }

  if (geometry.type === 'GeometryCollection') {
    return {
      ...geometry,
      geometries: geometry.geometries.map(transformGeometry),
    };
  }

  if (!('coordinates' in geometry)) {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }

  return {
    ...geometry,
    coordinates: transformCoordinates(geometry.coordinates),
  };
}

export function convertGeoJson27700To4326(geoJson) {
  if (!geoJson || typeof geoJson !== 'object') {
    throw new Error('GeoJSON input is required');
  }

  switch (geoJson.type) {
    case 'Feature':
      return {
        ...geoJson,
        geometry: transformGeometry(geoJson.geometry),
      };

    case 'FeatureCollection':
      return {
        ...geoJson,
        features: geoJson.features.map((feature) => ({
          ...feature,
          geometry: transformGeometry(feature.geometry),
        })),
      };

    case 'Point':
    case 'MultiPoint':
    case 'LineString':
    case 'MultiLineString':
    case 'Polygon':
    case 'MultiPolygon':
    case 'GeometryCollection':
      return transformGeometry(geoJson);

    default:
      throw new Error(`Unsupported GeoJSON type: ${geoJson.type}`);
  }
}
