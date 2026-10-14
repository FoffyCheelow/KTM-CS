import { attendance, overlaps, reservation, totalPeople, zoneArea, type Booking, type Config, type Evaluation, type Issue, type Proposal, type Request } from './model.ts';
import {DateTime} from 'luxon';

export function connected(ids: number[], config: Config): boolean {
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(x => !config.zones.some(z => z.id === x))) return false;
  const seen = new Set([ids[0]]), stack = [ids[0]];
  while (stack.length) {
    const id = stack.pop()!;
    for (const [a, b] of config.edges) {
      const next = a === id ? b : b === id ? a : 0;
      if (ids.includes(next) && !seen.has(next)) { seen.add(next); stack.push(next); }
    }
  }
  return seen.size === ids.length;
}
export function evaluate(r: Request, ids: number[], bookings: Booking[], c: Config, excludeId?: string): Evaluation {
  const issues: Issue[] = [];
  const add = (code: string, message: string, severity: 'error' | 'review' = 'error') => {
    if (!issues.some(i => i.code === code && i.message === message)) issues.push({code, message, severity});
  };
  const people = totalPeople(r), factor = c.factors[r.classification];
  const area = r.type === 'dirty' ? 900 * 0.09290304 : zoneArea(ids, c);
  const indicativeArea = people * (factor ?? 0), requiredArea = Math.max(indicativeArea, r.minimumArea, r.practicalArea);
  const shortfall = Math.max(0, requiredArea - area);
  if (r.type === 'dirty' && ids.length) add('dirty-zones', 'The fixed dirty workshop cannot use flexible zones.');
  if (r.type !== 'dirty' && !connected(ids, c)) add('disconnected', 'Select one connected group of whole zones; corner contact does not connect zones.');
  if (ids.some(id => c.zones.find(z => z.id === id)?.unavailable)) add('unavailable', 'One or more selected zones are unavailable.');
  if (shortfall > 0.00001) add('area', `The selected space is ${shortfall.toFixed(2)} m² short of the ${requiredArea.toFixed(2)} m² planning requirement.`);
  if (!factor) add('classification', 'Choose a configured activity classification.');
  const active = bookings.filter(b => b.id !== excludeId && c.reserveStatuses.includes(b.status));
  const simultaneous = active.filter(b => overlaps(reservation(r), reservation(b)));
  for (const b of simultaneous) {
    const common = ids.filter(id => b.zones.includes(id));
    if (common.length || (r.type === 'dirty' && b.type === 'dirty')) add('booking-conflict', `${b.name} reserves ${common.length ? `Zone${common.length > 1 ? 's' : ''} ${common.join(', ')}` : 'the dirty workshop'}, including setup and pack-down.`);
    if (c.incompatiblePairs.some(([a, d]) => (a === r.type && d === b.type) || (d === r.type && a === b.type))) add('incompatible', `${r.type} and ${b.type} activities are configured as incompatible during overlapping reservations.`);
  }
  // Sweep every boundary; never add bookings that do not overlap one another.
  const rr = reservation(r);
  const boundaries = [...new Set([rr[0], rr[1], ...simultaneous.flatMap(b => reservation(b)).filter(t => t > rr[0] && t < rr[1])])].sort((a,b) => a-b);
  for (let i = 0; i < boundaries.length - 1; i++) {
    const t = boundaries[i];
    const present = simultaneous.filter(b => { const [s,e] = reservation(b); return s <= t && t < e; });
    for (const [item, quantity] of Object.entries(r.equipment)) {
      if (quantity + present.reduce((n, b) => n + (b.equipment[item] || 0), 0) > (c.equipment[item] ?? 0)) add('equipment', `${item}: overlapping reservations exceed the shared stock of ${c.equipment[item] ?? 0}.`);
    }
  }
  const ar = attendance(r);
  const occupancies = active.filter(b => overlaps(ar, attendance(b)));
  const ticks = [...new Set([ar[0], ar[1], ...occupancies.flatMap(b => attendance(b)).filter(t => t > ar[0] && t < ar[1])])].sort((a,b) => a-b);
  for (let i = 0; i < ticks.length - 1; i++) {
    const t = ticks[i];
    const present = occupancies.filter(b => {const [s,e] = attendance(b); return s <= t && t < e;});
    const allPeople = people + present.reduce((n,b) => n + totalPeople(b), 0);
    if (c.wholeStudioLimit !== null && allPeople > c.wholeStudioLimit) add('studio-limit', `Simultaneous occupancy of ${allPeople} exceeds the studio limit of ${c.wholeStudioLimit}.`);
    if (c.escapeLimit !== null && allPeople > c.escapeLimit) add('escape-limit', `Simultaneous occupancy of ${allPeople} exceeds the shared escape limit of ${c.escapeLimit}.`);
    for (const route of c.routeLimits) {
      if (!ids.some(id => route.zones.includes(id))) continue;
      const routePeople = people + present.filter(b => b.zones.some(id => route.zones.includes(id))).reduce((n,b) => n + totalPeople(b),0);
      if (routePeople > route.limit) add('route-limit', `${route.name}: ${routePeople} people exceed the approved route limit of ${route.limit}.`);
    }
  }
  if (r.type === 'dirty' && c.dirtyLimit !== null && people > c.dirtyLimit) add('dirty-limit', `The fixed workshop limit is ${c.dirtyLimit} people.`);
  // Zone limits are conservative: no assumption about distributing occupants within a group.
  for (const id of ids) if (c.zoneLimits[id] !== undefined && people > c.zoneLimits[id]) add('zone-limit', `Zone ${id} has a configured limit of ${c.zoneLimits[id]}; review occupant distribution before using this group.`);
  for (const limit of c.combinationLimits) if (limit.zones.length === ids.length && limit.zones.every(id => ids.includes(id)) && people > limit.limit) add('combination-limit', `This zone combination is limited to ${limit.limit} people.`);
  if (c.wholeStudioLimit === null || c.escapeLimit === null || (r.type === 'dirty' && c.dirtyLimit === null)) add('limits-unverified', 'Approved studio and escape limits must be recorded before confirmation.', 'review');
  if (!c.verifiedClassifications.includes(r.classification)) add('factor-unverified', 'The manager must verify the activity classification and its reference factor.', 'review');
  if (!c.operationalReviewComplete || !c.approvalReference.trim()) add('operational-review', 'Site fire strategy, accessibility, ventilation and practical layout require manager review.', 'review');
  const outcome = issues.some(i => i.severity === 'error') ? 'cannot' : issues.length ? 'review' : 'fits';
  return { zones: ids, area, people, indicativeArea, requiredArea, shortfall, planningHeadcount: factor ? Math.floor((area + 1e-9) / factor) : 0, issues, outcome, canConfirm: outcome === 'fits' };
}
export function propose(r: Request, bookings: Booking[], c: Config, excludeId?: string): Proposal {
  const active = bookings.filter(b => b.id !== excludeId && c.reserveStatuses.includes(b.status) && overlaps(reservation(r), reservation(b)));
  const available = c.zones.filter(z => !z.unavailable && !active.some(b => b.zones.includes(z.id))).map(z => z.id);
  if (r.type === 'dirty') return { selected: evaluate(r, [], bookings, c, excludeId), alternatives: [], preferred: false, available };
  const configured = c.preferences.find(p => p.type === r.type && p.people === totalPeople(r))?.zones || [];
  const preferred = r.preferredZones.length ? r.preferredZones : configured;
  const candidates: Evaluation[] = [];
  for (let mask = 1; mask < 1 << 10; mask++) {
    const ids = c.zones.filter((_, i) => mask & (1 << i)).map(z => z.id);
    if (!ids.every(id => available.includes(id)) || !connected(ids, c)) continue;
    const value = evaluate(r, ids, bookings, c, excludeId);
    if (!value.issues.some(i => i.severity === 'error')) candidates.push(value);
  }
  const perimeter = (ids: number[]) => ids.length * 4 - c.edges.filter(([a,b]) => ids.includes(a) && ids.includes(b)).length * 2;
  candidates.sort((a,b) => a.zones.length - b.zones.length || b.zones.filter(id => preferred.includes(id)).length - a.zones.filter(id => preferred.includes(id)).length || perimeter(a.zones) - perimeter(b.zones) || a.area - b.area || a.zones.join(',').localeCompare(b.zones.join(',')));
  if (preferred.length && preferred.every(id => available.includes(id)) && connected(preferred, c)) {
    const selected = evaluate(r, preferred, bookings, c, excludeId);
    const extensions = candidates.filter(v => preferred.every(id => v.zones.includes(id)) && v.zones.length > preferred.length);
    const smallestExtensions = extensions.filter(v => v.zones.length === extensions[0]?.zones.length);
    return { selected, alternatives: (selected.shortfall > 0 && smallestExtensions.length ? smallestExtensions : candidates.filter(v => v.zones.join(',') !== preferred.join(','))).slice(0,3), preferred: true, available };
  }
  const selected = candidates[0] ?? evaluate(r, available, bookings, c, excludeId);
  return { selected, alternatives: candidates.slice(1,4), preferred: false, available };
}

export interface Fallback { label: string; description: string; request: Request; zones: number[] }
// Fallbacks run through the same planner; no unvalidated suggestion is offered.
export function findFallbacks(r: Request, bookings: Booking[], c: Config): Fallback[] {
  const results: Fallback[]=[];
  const valid=(p:Proposal)=>[p.selected,...p.alternatives].find(v=>!v.issues.some(i=>i.severity==='error'));
  const available=propose(r,bookings,c).available;
  const availableArea=r.type==='dirty'?900*.09290304:zoneArea(available,c);
  const max=Math.min(r.participants-1,Math.floor(availableArea/(c.factors[r.classification]||1))-r.staff-r.visitors);
  for(let participants=max;participants>=1;participants--) {
    const next={...r,participants,preferredZones:[]};
    const found=valid(propose(next,bookings,c));
    if(found){results.push({label:`Try ${participants} participants`,description:`${participants+r.staff+r.visitors} people including staff and visitors · ${found.area.toFixed(2)} m²`,request:next,zones:found.zones});break;}
  }
  const required=Math.max(totalPeople(r)*(c.factors[r.classification]||0),r.minimumArea,r.practicalArea);
  if(required<=(r.type==='dirty'?900*.09290304:zoneArea(c.zones.filter(z=>!z.unavailable).map(z=>z.id),c))) {
    for(const hours of [2,4,24,48]) {
      const shift=(iso:string)=>DateTime.fromISO(iso).setZone('Europe/London').plus(hours>=24?{days:hours/24}:{hours}).toISO()!;
      const next={...r,start:shift(r.start),end:shift(r.end),attendanceStart:r.attendanceStart?shift(r.attendanceStart):undefined,attendanceEnd:r.attendanceEnd?shift(r.attendanceEnd):undefined};
      const found=valid(propose(next,bookings,c));
      if(found){results.push({label:`Try ${DateTime.fromISO(next.start).setZone('Europe/London').toFormat('ccc d LLL, HH:mm')}`,description:`Same headcount and layout · ${found.area.toFixed(2)} m² · London time`,request:next,zones:found.zones});break;}
    }
  }
  return results;
}
