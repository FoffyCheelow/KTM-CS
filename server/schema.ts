import { z } from 'zod';
const id = z.number().int().min(1).max(10);
const ids = z.array(id).max(10).refine(v => new Set(v).size === v.length, 'Zone IDs must be unique.');
const count = z.number().int().min(0).max(10000);
const text = z.string().max(5000);
const instant = z.iso.datetime({offset: true});
const activity = z.enum(['clean', 'dirty', 'meeting', 'exhibition']);
export const statusSchema = z.enum(['draft','pending','confirmed','cancelled']);
export const requestSchema = z.object({
  name: z.string().trim().min(1).max(160), organisation: z.string().max(200), type: activity,
  classification: z.enum(['workshop','meeting','exhibition','gallery']), layout: z.string().max(120),
  participants: count, staff: count, visitors: count, start: instant, end: instant,
  setup: z.number().int().min(0).max(10080), packdown: z.number().int().min(0).max(10080),
  attendanceStart: instant.optional(), attendanceEnd: instant.optional(),
  equipment: z.record(z.string().max(100), count), accessibility: text, notes: text,
  minimumArea: z.number().min(0).max(10000), practicalArea: z.number().min(0).max(10000), preferredZones: ids
}).superRefine((r, ctx) => {
  const fail = (message: string) => ctx.addIssue({code:'custom', message});
  if (Date.parse(r.end) <= Date.parse(r.start)) fail('End must be after start.');
  if (Date.parse(r.end) - Date.parse(r.start) > 366 * 86400000) fail('Reservations may span at most one year.');
  if (r.participants + r.staff + r.visitors < 1) fail('Include at least one person.');
  if ((r.attendanceStart && !r.attendanceEnd) || (!r.attendanceStart && r.attendanceEnd)) fail('Provide both attendance times.');
  if (r.attendanceStart && r.attendanceEnd && (Date.parse(r.attendanceStart) < Date.parse(r.start) - r.setup*60000 || Date.parse(r.attendanceEnd) > Date.parse(r.end) + r.packdown*60000 || Date.parse(r.attendanceEnd) <= Date.parse(r.attendanceStart))) fail('Attendance must be within the reservation (including setup and pack-down), with an end after its start.');
  if ((r.type === 'clean' || r.type === 'dirty') && r.classification !== 'workshop') fail('Workshop activities must use the workshop classification.');
  if (r.type === 'meeting' && r.classification !== 'meeting') fail('Meetings must use the meeting classification.');
  if (r.type === 'exhibition' && !['exhibition','gallery'].includes(r.classification)) fail('Exhibitions must use exhibition or art gallery classification.');
});
export const proposalSchema = z.object({request: requestSchema, zones: ids.optional()});
export const bookingSchema = z.object({request: requestSchema, zones: ids, status: statusSchema});
export const configSchema = z.object({
  version: z.number().int().positive(),
  zones: z.array(z.object({ id, sqft: z.number().positive().max(10000), areaVerified: z.boolean(), unavailable: z.boolean(), points: z.string().regex(/^[\d.,\s-]+$/).min(10).max(2000) })).length(10).refine(zones => zones.every((z,i) => z.id === i+1), 'Keep all ten zones, numbered 1–10 in order.'),
  edges: z.array(z.tuple([id, id])).max(45).refine(edges => edges.every(([a,b]) => a !== b) && new Set(edges.map(e => [...e].sort((a,b)=>a-b).join(','))).size === edges.length, 'Edges must be distinct and connect different zones.'),
  preferences: z.array(z.object({type: activity, people: count, zones: ids})).max(100),
  factors: z.object({ workshop: z.number().positive(), meeting: z.number().positive(), exhibition: z.number().positive(), gallery: z.number().positive() }),
  verifiedClassifications: z.array(z.enum(['workshop','meeting','exhibition','gallery'])),
  wholeStudioLimit: count.nullable(), escapeLimit: count.nullable(), dirtyLimit: count.nullable(),
  zoneLimits: z.record(z.string().regex(/^(?:[1-9]|10)$/), count),
  combinationLimits: z.array(z.object({zones: ids.min(1), limit: count})).max(100),
  routeLimits: z.array(z.object({name: z.string().min(1).max(120), zones: ids.min(1), limit: count})).max(100),
  equipment: z.record(z.string().max(100), count), incompatiblePairs: z.array(z.tuple([activity,activity])).max(16),
  operationalReviewComplete: z.boolean(), approvalReference: text,
  reserveStatuses: z.array(statusSchema).refine(v => v.includes('confirmed') && !v.includes('cancelled'), 'Confirmed bookings must reserve space; cancelled bookings cannot.'),
  scaleMetersPerUnit: z.number().positive().nullable(), routes: z.array(z.string().regex(/^[MmLlHhVvZzQqCcSsTtAaEe\d.,\s+-]+$/).max(4000)).max(100),
  obstructions: z.array(z.object({x:z.number(),y:z.number(),width:z.number().positive(),height:z.number().positive()})).max(100),
  sources: z.array(z.object({title:text,url:z.string().refine(s => s.startsWith('https://') || s.startsWith('/references/')),edition:text,section:text,effectiveDate:text,verified:z.boolean(),checkedAt:z.string().nullable()})).max(30)
}).superRefine((c,ctx) => {
  if ((c.operationalReviewComplete || c.verifiedClassifications.length > 0) && !c.approvalReference.trim()) ctx.addIssue({code:'custom',message:'Record the site approval or verification reference before marking checks complete.'});
});
