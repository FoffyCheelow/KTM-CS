export type ActivityType = 'clean' | 'dirty' | 'meeting' | 'exhibition' | 'screening';
export type Status = 'draft' | 'pending' | 'confirmed' | 'cancelled';
export const SQFT_TO_M2 = 0.09290304;
export const TYPES: Record<ActivityType, string> = { clean: 'Clean workshop', dirty: 'Dirty workshop', meeting: 'Meeting', exhibition: 'Exhibition', screening: 'Screening' };
export interface Zone { id: number; sqft: number; areaVerified: boolean; unavailable: boolean; points: string }
export interface Source { title: string; url: string; edition: string; section: string; effectiveDate: string; verified: boolean; checkedAt: string | null }
export interface Config {
  version: number; zones: Zone[]; edges: [number, number][];
  preferences: { type: ActivityType; people: number; zones: number[] }[];
  factors: Record<string, number>; verifiedClassifications: string[];
  wholeStudioLimit: number | null; escapeLimit: number | null; dirtyLimit: number | null;
  zoneLimits: Record<string, number>; combinationLimits: { zones: number[]; limit: number }[];
  routeLimits: { name: string; zones: number[]; limit: number }[];
  equipment: Record<string, number>; incompatiblePairs: [ActivityType, ActivityType][];
  operationalReviewComplete: boolean; approvalReference: string;
  reserveStatuses: Status[]; scaleMetersPerUnit: number | null;
  routes: string[]; obstructions: { x: number; y: number; width: number; height: number }[];
  sources: Source[];
}
export interface Request {
  name: string; organisation: string; type: ActivityType; classification: string; layout: string;
  participants: number; staff: number; visitors: number;
  start: string; end: string; setup: number; packdown: number;
  attendanceStart?: string; attendanceEnd?: string;
  equipment: Record<string, number>; accessibility: string; notes: string;
  minimumArea: number; practicalArea: number; preferredZones: number[];
}
export interface Booking extends Request {
  id: string; zones: number[]; status: Status; ruleVersion: number; areaAtSave: number;
  createdAt: string; demo: boolean; requiresRevalidation: boolean;
}
export interface StorageInput {
  items: string;
  startDate: string;
  endDate: string;
  organisation?: string;
}
export interface StorageRequest extends StorageInput {
  id: string;
  organisation: string;
  status: Status;
  createdAt: string;
  reviewRequired: true;
}
export interface Issue { code: string; message: string; severity: 'error' | 'review' }
export interface Evaluation {
  zones: number[]; area: number; people: number; indicativeArea: number; requiredArea: number;
  shortfall: number; planningHeadcount: number; issues: Issue[];
  outcome: 'fits' | 'review' | 'cannot'; canConfirm: boolean;
}
export interface Proposal { selected: Evaluation; alternatives: Evaluation[]; preferred: boolean; available: number[] }

// Coordinates align with the supplied A101 drawing rendered into a 1600 × 1131 frame.
const tops = [380, 388, 380, 388, 388];
export function defaultConfig(): Config {
  return {
    version: 1,
    zones: Array.from({ length: 10 }, (_, i) => {
      const col = i % 5, x = 378 + col * 118, y = i < 5 ? tops[col] : 620, bottom = i < 5 ? 620 : 774;
      return { id: i + 1, sqft: i < 5 ? 288 : 192, areaVerified: false, unavailable: false, points: `${x},${y} ${x + 118},${y} ${x + 118},${bottom} ${x},${bottom}` };
    }),
    edges: [[1,2],[2,3],[3,4],[4,5],[6,7],[7,8],[8,9],[9,10],[1,6],[2,7],[3,8],[4,9],[5,10]],
    preferences: [{ type: 'clean', people: 20, zones: [4,5,9,10] }, { type: 'meeting', people: 5, zones: [7] }],
    factors: { workshop: 5, meeting: 1, exhibition: 1.5, gallery: 5 }, verifiedClassifications: [],
    wholeStudioLimit: null, escapeLimit: null, dirtyLimit: null, zoneLimits: {}, combinationLimits: [], routeLimits: [],
    equipment: { Tables: 12, Chairs: 60, Projector: 1, 'Sewing machines': 6 }, incompatiblePairs: [],
    operationalReviewComplete: false, approvalReference: '', reserveStatuses: ['pending', 'confirmed'], scaleMetersPerUnit: null,
    routes: ['M 390 398 L 390 590 L 390 648 L 352 648', 'M 390 600 L 995 600 L 995 500 L 1215 500'],
    obstructions: [{ x: 478, y: 458, width: 10, height: 12 }, ...[478,602,726,850].map(x => ({x, y: 614, width: 10, height: 12})), { x: 478, y: 682, width: 10, height: 12 }],
    sources: [
      { title: 'Approved Document B, Volume 2', url: 'https://www.gov.uk/government/publications/fire-safety-approved-document-b', edition: 'Applicable edition to be verified; supplied slides cite a 2026 compilation', section: 'Appendix D, Table D1 — floor space factors (verify)', effectiveDate: 'Unverified; do not apply future amendments', verified: false, checkedAt: null },
      { title: 'Regulatory Reform (Fire Safety) Order 2005', url: 'https://www.legislation.gov.uk/uksi/2005/1541/contents', edition: '2005, as amended; current amendments unverified', section: 'Articles 8, 9 and 14 — precautions, assessment and escape', effectiveDate: 'Current applicability to be verified', verified: false, checkedAt: null },
      { title: 'Fire safety risk assessment: factories and warehouses', url: 'https://www.gov.uk/government/publications/fire-safety-risk-assessment-factories-and-warehouses', edition: 'Current official edition unverified', section: 'Risk assessment and means of escape', effectiveDate: 'Unverified', verified: false, checkedAt: null },
      { title: 'Community Studio Use Scenarios', url: '/references/use-scenarios.pdf', edition: 'September 2026', section: 'Pages 3–11; provisional planning only', effectiveDate: 'Planning reference, not an approved fire strategy', verified: false, checkedAt: null },
      { title: 'A101 First Floor Architectural Plan', url: '/references/floor-plan.pdf', edition: '16 July 2026 drawing', section: 'First floor; visual reference, not a surveyed zone schedule', effectiveDate: 'Planning reference', verified: false, checkedAt: null }
    ]
  };
}
export const totalPeople = (r: Request) => r.participants + r.staff + r.visitors;
export const zoneArea = (ids: number[], c: Config) => ids.reduce((n, id) => n + (c.zones.find(z => z.id === id)?.sqft ?? 0) * SQFT_TO_M2, 0);
export const reservation = (r: Request): [number, number] => [Date.parse(r.start) - r.setup * 60_000, Date.parse(r.end) + r.packdown * 60_000];
// Conservatively count everyone throughout setup and pack-down unless an explicit
// attendance interval is supplied. Space and equipment always keep the full reservation.
export const attendance = (r: Request): [number, number] => [r.attendanceStart ? Date.parse(r.attendanceStart) : reservation(r)[0], r.attendanceEnd ? Date.parse(r.attendanceEnd) : reservation(r)[1]];
export const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];
