import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig, SQFT_TO_M2, zoneArea, type Request, type Booking} from '../shared/model.ts';
import {connected,evaluate,propose,findFallbacks} from '../shared/engine.ts';
import {localToISO, storageInterval} from '../shared/time.ts';
export function request(patch:Partial<Request>={}):Request {return {name:'Test activity',organisation:'Test',type:'clean',classification:'workshop',layout:'Collaborative tables',participants:20,staff:0,visitors:0,start:'2027-02-01T10:00:00+00:00',end:'2027-02-01T12:00:00+00:00',setup:0,packdown:0,equipment:{},accessibility:'',notes:'',minimumArea:0,practicalArea:0,preferredZones:[],...patch};}
function booking(patch:Partial<Booking>={}):Booking {return {...request(),id:'other',zones:[7],participants:2,type:'meeting',classification:'meeting',status:'pending',ruleVersion:1,areaAtSave:17.83,createdAt:'2027-01-01T00:00:00Z',demo:false,requiresRevalidation:false,...patch};}
test('ten zones total exactly 2400 sq ft and use an unrounded conversion',()=> {const c=defaultConfig();assert.equal(c.zones.reduce((n,z)=>n+z.sqft,0),2400);assert.ok(Math.abs(zoneArea(c.zones.map(z=>z.id),c)-2400*SQFT_TO_M2)<1e-10);assert.deepEqual(c.zones.map(z=>z.id),[1,2,3,4,5,6,7,8,9,10]);});
test('adjacency follows the supplied two-row diagram, with no diagonal edges',()=> {const c=defaultConfig();assert.deepEqual(c.edges.filter(e=>e.includes(7)).flat().filter(x=>x!==7).sort((a,b)=>a-b),[2,6,8]);assert.equal(connected([4,5,9,10],c),true);assert.equal(connected([1,7,3,9],c),false);assert.equal(connected([1,7],c),false);assert.equal(connected([],c),false);assert.equal(connected([1,1],c),false);assert.equal(connected([11],c),false);});
test('disabled connections cannot provide continuity',()=>{const c=defaultConfig();c.edges=c.edges.filter(([a,b])=>a!==4||b!==5);assert.equal(connected([4,5],c),false);assert.equal(connected([4,5,9,10],c),true);});
test('one complete zone is the minimum and all ten are the maximum',()=>{const c=defaultConfig();const small=propose(request({type:'meeting',classification:'meeting',participants:1}),[],c);assert.equal(small.selected.zones.length,1);const full=propose(request({participants:21,minimumArea:222.96}),[],c);assert.equal(full.selected.zones.length,10);assert.ok(!full.selected.zones.includes(11));});
test('five-person meeting prefers the whole of Zone 7',()=>{const p=propose(request({type:'meeting',classification:'meeting',participants:5}),[],defaultConfig());assert.deepEqual(p.selected.zones,[7]);});
test('20-person clean workshop preserves preference and flags its real shortfall',()=>{const p=propose(request(),[],defaultConfig());assert.deepEqual(p.selected.zones,[4,5,9,10]);assert.equal(p.preferred,true);assert.ok(Math.abs(p.selected.area-960*SQFT_TO_M2)<1e-9);assert.ok(Math.abs(p.selected.shortfall-(100-960*SQFT_TO_M2))<1e-9);assert.equal(p.selected.outcome,'cannot');assert.ok(p.alternatives.length);for(const a of p.alternatives){assert.equal(a.zones.length,5);assert.ok(connected(a.zones,defaultConfig()));assert.ok([4,5,9,10].every(id=>a.zones.includes(id)));assert.ok(a.area>=100);}});
test('unavailable preferred zone triggers a suitable single-zone meeting alternative',()=>{const c=defaultConfig();const p=propose(request({type:'meeting',classification:'meeting',participants:5}),[booking()],c);assert.equal(p.selected.zones.length,1);assert.ok(!p.selected.zones.includes(7));assert.ok(!p.selected.issues.some(i=>i.severity==='error'));});
test('manual selection rejects disconnection and cannot bridge through another activity',()=>{const e=evaluate(request({participants:1}),[1,3],[booking({zones:[2]})],defaultConfig());assert.ok(e.issues.some(i=>i.code==='disconnected'));assert.ok(!connected([1,3],defaultConfig()));});
test('setup and packdown block the same whole zones using half-open intervals',()=>{const b=booking({setup:30,packdown:30});const c=defaultConfig();assert.ok(evaluate(request({start:'2027-02-01T09:35:00Z',end:'2027-02-01T09:50:00Z',participants:1}),[7],[b],c).issues.some(i=>i.code==='booking-conflict'));assert.ok(evaluate(request({start:'2027-02-01T12:10:00Z',end:'2027-02-01T12:20:00Z',participants:1}),[7],[b],c).issues.some(i=>i.code==='booking-conflict'));assert.ok(!evaluate(request({start:'2027-02-01T12:30:00Z',end:'2027-02-01T13:00:00Z',participants:1}),[7],[b],c).issues.some(i=>i.code==='booking-conflict'));});
test('overnight physical reservation blocks zones when no people are present',()=>{const c=defaultConfig();c.wholeStudioLimit=5;const b=booking({start:'2027-02-01T08:00:00Z',end:'2027-02-03T18:00:00Z',attendanceStart:'2027-02-01T10:00:00Z',attendanceEnd:'2027-02-01T12:00:00Z',participants:5});const r=request({start:'2027-02-02T10:00:00Z',end:'2027-02-02T12:00:00Z',participants:1});const e=evaluate(r,[7],[b],c);assert.ok(e.issues.some(i=>i.code==='booking-conflict'));assert.ok(!e.issues.some(i=>i.code==='studio-limit'));});
test('all staff, visitors and simultaneous occupants count against studio limits',()=>{const c=defaultConfig();c.wholeStudioLimit=10;const e=evaluate(request({type:'meeting',classification:'meeting',participants:5,staff:2,visitors:2}),[6],[booking({participants:2})],c);assert.equal(e.people,9);assert.ok(e.issues.some(i=>i.code==='studio-limit'&&i.message.includes('11')));});
test('occupancy sweep never adds non-simultaneous bookings together',()=>{const c=defaultConfig();c.wholeStudioLimit=10;const bs=[booking({id:'a',participants:8,start:'2027-02-01T10:00:00Z',end:'2027-02-01T11:00:00Z'}),booking({id:'b',participants:8,start:'2027-02-01T11:00:00Z',end:'2027-02-01T12:00:00Z'})];const e=evaluate(request({type:'meeting',classification:'meeting',participants:2}),[6],bs,c);assert.ok(!e.issues.some(i=>i.code==='studio-limit'));});
test('equipment availability uses all reservation boundaries and stock',()=>{const c=defaultConfig();const b=booking({equipment:{Projector:1},setup:15});assert.ok(evaluate(request({participants:1,equipment:{Projector:1}}),[6],[b],c).issues.some(i=>i.code==='equipment'));});
test('drafts and cancellations do not block availability by default; confirmed does',()=>{const r=request({type:'meeting',classification:'meeting',participants:5});for(const status of ['draft','cancelled'] as const)assert.deepEqual(propose(r,[booking({status})],defaultConfig()).selected.zones,[7]);assert.ok(!propose(r,[booking({status:'confirmed'})],defaultConfig()).selected.zones.includes(7));});
test('dirty workshop is never a flexible zone and has its own conflict checks',()=>{const c=defaultConfig();const r=request({type:'dirty',participants:10});const p=propose(r,[],c);assert.deepEqual(p.selected.zones,[]);assert.ok(Math.abs(p.selected.area-900*SQFT_TO_M2)<1e-9);assert.ok(evaluate(r,[1],[],c).issues.some(i=>i.code==='dirty-zones'));assert.ok(evaluate(r,[],[booking({type:'dirty',zones:[]})],c).issues.some(i=>i.code==='booking-conflict'));});
test('missing approvals block confirmation while retaining draft planning',()=>{const c=defaultConfig(),r=request({type:'meeting',classification:'meeting',participants:5});let e=evaluate(r,[7],[],c);assert.equal(e.outcome,'review');assert.equal(e.canConfirm,false);c.wholeStudioLimit=40;c.escapeLimit=40;c.verifiedClassifications=['meeting'];c.operationalReviewComplete=true;c.approvalReference='TEST ONLY: approved test configuration';e=evaluate(r,[7],[],c);assert.equal(e.canConfirm,true);});
test('combined headcount rounds only after summing unrounded areas',()=>{const r=request({participants:1}),c=defaultConfig();const e=evaluate(r,[6,7],[],c);assert.equal(e.planningHeadcount,Math.floor(384*SQFT_TO_M2/5));assert.equal(e.planningHeadcount,7);});
test('Europe/London conversion rejects nonexistent times and distinguishes repeated times',()=>{assert.throws(()=>localToISO('2027-03-28T01:30'),/does not exist/);assert.equal(localToISO('2027-10-31T01:30','earlier'),'2027-10-31T01:30:00.000+01:00');assert.equal(localToISO('2027-10-31T01:30','later'),'2027-10-31T01:30:00.000+00:00');assert.equal(localToISO('2027-07-01T10:00'),'2027-07-01T10:00:00.000+01:00');});
test('headcount and time alternatives are validated by the same allocation rules',()=>{const c=defaultConfig();const r=request({participants:100});const fallback=findFallbacks(r,[],c).find(f=>f.request.participants<100);assert.ok(fallback);assert.equal(evaluate(fallback.request,fallback.zones,[],c).issues.some(i=>i.severity==='error'),false);const occupied=booking({zones:[1,2,3,4,5,6,7,8,9,10]});const nextTime=findFallbacks(request({type:'meeting',classification:'meeting',participants:5}),[occupied],c).find(f=>f.request.start!==r.start);assert.ok(nextTime);assert.equal(evaluate(nextTime.request,nextTime.zones,[occupied],c).issues.some(i=>i.severity==='error'),false);});
test('default attendance includes setup and packdown for conservative occupancy checks',()=>{const c=defaultConfig();c.wholeStudioLimit=5;const b=booking({participants:5,setup:30});const e=evaluate(request({type:'meeting',classification:'meeting',participants:1,start:'2027-02-01T09:40:00Z',end:'2027-02-01T09:50:00Z'}),[6],[b],c);assert.ok(e.issues.some(i=>i.code==='studio-limit'));});
test('screenings always select Zone 3 and expand only into Zones 2 and 4',()=>{
  const c=defaultConfig(),r=request({type:'screening',classification:'meeting',participants:20,equipment:{Projector:1}});
  assert.deepEqual(propose(r,[],c).selected.zones,[3]);
  for(const count of [40,70]) {
    const selected=propose({...r,participants:count},[],c).selected;
    assert.ok(selected.zones.includes(3));
    assert.ok(selected.zones.every(id=>[2,3,4].includes(id)));
    assert.equal(selected.issues.some(i=>i.severity==='error'),false);
  }
  for(const zones of [[2],[4],[3,8],[1,2,3]]) assert.ok(evaluate(r,zones,[],c).issues.some(i=>i.code==='screening-zones'));
  assert.deepEqual(propose({...r,preferredZones:[4]},[],c).selected.zones,[3]);
});
test('screening equipment is mandatory and shared projector conflicts are checked',()=>{
  const c=defaultConfig(),r=request({type:'screening',classification:'meeting',participants:10});
  assert.ok(evaluate(r,[3],[],c).issues.some(i=>i.code==='screening-equipment'));
  c.equipment.Screen=1;
  assert.ok(!evaluate({...r,equipment:{Screen:1}},[3],[],c).issues.some(i=>i.code==='screening-equipment'));
  const b=booking({zones:[7],equipment:{Projector:1}});
  assert.ok(evaluate({...r,equipment:{Projector:1}},[3],[b],c).issues.some(i=>i.code==='equipment'));
});
test('an occupied or unavailable Zone 3 never causes screening relocation',()=>{
  const c=defaultConfig(),r=request({type:'screening',classification:'meeting',participants:5,equipment:{Projector:1}});
  const conflict=propose(r,[booking({zones:[3]})],c);
  assert.deepEqual(conflict.selected.zones,[3]);assert.equal(conflict.selected.outcome,'cannot');assert.equal(conflict.alternatives.length,0);
  c.zones[2].unavailable=true;
  assert.deepEqual(propose(r,[],c).selected.zones,[3]);assert.ok(propose(r,[],c).selected.issues.some(i=>i.code==='unavailable'));
});
test('storage date ranges include the end date and follow London clock changes',()=>{
  const spring=storageInterval('2027-03-28','2027-03-28');assert.equal((spring[1]-spring[0])/3600000,23);
  const autumn=storageInterval('2026-10-25','2026-10-25');assert.equal((autumn[1]-autumn[0])/3600000,25);
  const multi=storageInterval('2027-02-01','2027-02-03');assert.equal((multi[1]-multi[0])/3600000,72);
});
