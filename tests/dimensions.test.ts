import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig} from '../shared/model.ts';
import {dimensions, zoneBounds} from '../shared/dimensions.ts';

test('dimensions stay unavailable until the drawing scale is calibrated', () => {
  const config = defaultConfig();
  assert.equal(config.scaleMetersPerUnit, null);
  assert.equal(dimensions([4, 5, 9, 10], config), null);
  for (const scale of [0, -1, NaN, Infinity]) {
    config.scaleMetersPerUnit = scale;
    assert.equal(dimensions([7], config), null);
  }
});

test('selected group dimensions use its geometric bounds and configured scale', () => {
  const config = defaultConfig();
  config.scaleMetersPerUnit = 0.04;
  assert.deepEqual(zoneBounds([4, 5, 9, 10], config), {x: 732, y: 388, width: 236, height: 386});
  const actual = dimensions([4, 5, 9, 10], config)!;
  assert.equal(actual.width, 236 * 0.04);
  assert.equal(actual.depth, 386 * 0.04);
  assert.equal(actual.label, '≈ 9.4 m × 15.4 m');
  assert.equal(actual.estimated, true);
});

test('area schedule edits do not silently change lengths', () => {
  const config = defaultConfig();
  config.scaleMetersPerUnit = 0.05;
  const before = dimensions([7], config);
  config.zones.find(zone => zone.id === 7)!.sqft = 9999;
  config.zones.find(zone => zone.id === 7)!.areaVerified = true;
  assert.deepEqual(dimensions([7], config), before);
  config.zones.find(zone => zone.id === 7)!.points = '0,0 100,0 100,200 0,200';
  assert.equal(dimensions([7], config)!.label, '≈ 5 m × 10 m');
});

test('bounds show the enclosing rectangle of irregular groups rather than a fictional square', () => {
  const config = defaultConfig();
  config.scaleMetersPerUnit = 0.1;
  const bounds = zoneBounds([1, 2, 6], config)!;
  assert.deepEqual(bounds, {x: 378, y: 380, width: 236, height: 394});
  assert.notEqual(dimensions([1, 2, 6], config)!.width, dimensions([1, 2, 6], config)!.depth);
});

test('fixed dirty workshop has independent drawing bounds without becoming Zone 11', () => {
  const config = defaultConfig();
  config.scaleMetersPerUnit = 0.02;
  assert.deepEqual(zoneBounds([], config, 'dirty'), {x: 974, y: 401, width: 297, height: 372});
  assert.equal(dimensions([], config, 'dirty')!.label, '≈ 5.9 m × 7.4 m');
  assert.equal(zoneBounds([11], config), null);
});

test('empty, unknown, duplicate and malformed geometry cannot produce misleading dimensions', () => {
  const config = defaultConfig();
  config.scaleMetersPerUnit = 0.1;
  for (const ids of [[], [20], [1, 20], [7, 7]]) assert.equal(dimensions(ids, config), null);
  for (const points of ['invalid', '0,0 10,10', '0,0 10,0 20,0', '0,0 10,0 10..2,20', '0,0 10,0 10,Infinity']) {
    config.zones[0].points = points;
    assert.equal(dimensions([1], config), null);
  }
});
