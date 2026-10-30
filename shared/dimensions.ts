import type {ActivityType, Config} from './model.ts';

export interface PlanBounds { x: number; y: number; width: number; height: number }
export interface PlanDimensions {
  width: number;
  depth: number;
  /** Geometry remains provisional even when a manager supplies a scale. */
  estimated: boolean;
  label: string;
}

/** Matches the fixed-workshop overlay in the supplied architectural drawing. */
export const DIRTY_WORKSHOP_POINTS = '974,401 1075,401 1075,497 1229,497 1229,716 1271,724 1271,773 974,773';

/**
 * Drawing coordinates use the application's 1600 × 1131 image frame.
 * Bounds describe the entire enclosing rectangle, including recesses and any
 * space between selected polygons. They are not usable floor dimensions or area.
 * Selection/connectivity and booking validation remain the allocation engine's job.
 */
export function zoneBounds(ids: number[], config: Config, type?: ActivityType): PlanBounds | null {
  const polygons = type === 'dirty'
    ? [DIRTY_WORKSHOP_POINTS]
    : ids.length && new Set(ids).size === ids.length
      ? ids.map(id => config.zones.find(zone => zone.id === id)?.points)
      : [];
  if (!polygons.length || polygons.some(points => points === undefined)) return null;

  const vertices: [number, number][] = [];
  for (const polygon of polygons) {
    const raw = polygon!.trim();
    if (!raw || !/^[\d.,\s+-]+$/.test(raw)) return null;
    const tokens = raw.split(/[\s,]+/);
    if (tokens.length < 6 || tokens.length % 2 || tokens.some(token => token === '')) return null;
    const coordinates = tokens.map(Number);
    if (coordinates.some(coordinate => !Number.isFinite(coordinate))) return null;
    for (let index = 0; index < coordinates.length; index += 2) {
      vertices.push([coordinates[index], coordinates[index + 1]]);
    }
  }

  const x = Math.min(...vertices.map(vertex => vertex[0]));
  const y = Math.min(...vertices.map(vertex => vertex[1]));
  const width = Math.max(...vertices.map(vertex => vertex[0])) - x;
  const height = Math.max(...vertices.map(vertex => vertex[1])) - y;
  return width > 0 && height > 0 ? {x, y, width, height} : null;
}

/**
 * Never derive lengths from the square-foot area schedule. A101 declares 1:50
 * while its separate graphic scale is labelled 1:100, so the app deliberately
 * supplies no automatic scale. A manager must calibrate against a known length.
 */
export function dimensions(ids: number[], config: Config, type?: ActivityType): PlanDimensions | null {
  const scale = config.scaleMetersPerUnit;
  if (scale === null || !Number.isFinite(scale) || scale <= 0) return null;
  const bounds = zoneBounds(ids, config, type);
  if (!bounds) return null;
  const width = bounds.width * scale;
  const depth = bounds.height * scale;
  const format = (value: number) => Number(value.toFixed(1)).toString();
  return {width, depth, estimated: true, label: `≈ ${format(width)} m × ${format(depth)} m`};
}
