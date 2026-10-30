import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {Store} from '../server/store.ts';
import {request} from './fixtures.ts';
import {defaultConfig} from '../shared/model.ts';
import {storageInputSchema,requestSchema} from '../server/schema.ts';

test('SQLite persistence survives reopening and rules updates preserve reservations',()=>{const dir=mkdtempSync(join(tmpdir(),'studio-db-'));const file=join(dir,'test.sqlite');let store=new Store(file,false);try{const b=store.create(request({participants:2}),[7],'draft',false);store.close();store=new Store(file,false);assert.equal(store.bookings()[0].id,b.id);assert.deepEqual(store.bookings()[0].zones,[7]);store.updateConfig({...store.config(),zones:store.config().zones.map(z=>z.id===7?{...z,sqft:200}:z)});assert.equal(store.config().version,2);assert.deepEqual(store.bookings()[0].zones,[7]);assert.equal(store.bookings()[0].requiresRevalidation,true);assert.ok(store.audit().length>=2);}finally{store.close();rmSync(dir,{recursive:true,force:true});}});
test('legacy databases gain storage without losing bookings, rules, or history',()=>{
  const dir=mkdtempSync(join(tmpdir(),'studio-storage-')),file=join(dir,'test.sqlite');let store=new Store(file,false);
  try {
    const b=store.create(request({participants:2}),[7],'draft',false);
    const originalConfig=store.config();store.db.exec('DROP TABLE storage_requests');store.close();
    store=new Store(file,false);assert.deepEqual(store.config(),originalConfig);assert.equal(store.bookings()[0].id,b.id);
    const a=store.createStorage({items:'2 boxes of workshop materials',startDate:'2027-03-01',endDate:'2027-03-05'},'pending',false);
    const overlap=store.createStorage({items:'Flat-pack display boards',startDate:'2027-03-03',endDate:'2027-03-06'},'pending',false);
    assert.equal(a.reviewRequired,true);assert.equal(overlap.reviewRequired,true);
    assert.throws(()=>store.changeStorageStatus(a.id,'confirmed'),/unverified/);
    store.changeStorageStatus(a.id,'cancelled');store.close();store=new Store(file,false);
    assert.equal(store.storageRequests().length,2);assert.equal(store.storageRequests().find(s=>s.id===a.id)?.status,'cancelled');
    assert.ok(store.audit().some(row=>row.action==='storage.created'));assert.equal(store.bookings()[0].id,b.id);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
test('storage validates real dates, inclusive same-day ranges and item descriptions',()=>{
  assert.equal(storageInputSchema.parse({items:'One cabinet',startDate:'2027-03-01',endDate:'2027-03-01'}).organisation,'');
  for(const value of [{items:' ',startDate:'2027-03-01',endDate:'2027-03-02'},{items:'A box',startDate:'2027-02-30',endDate:'2027-03-02'},{items:'A box',startDate:'2027-03-02',endDate:'2027-03-01'}]) assert.equal(storageInputSchema.safeParse(value).success,false);
});
test('simplified activity requests infer internal defaults while preserving explicit legacy constraints',()=>{
  const base={name:'Screening',type:'screening',participants:10,start:'2027-03-01T10:00:00Z',end:'2027-03-01T12:00:00Z'};
  const parsed=requestSchema.parse(base);assert.equal(parsed.classification,'meeting');assert.deepEqual(parsed.equipment,{Projector:1});assert.equal(parsed.practicalArea,0);
  const legacy=request({minimumArea:200,practicalArea:210,notes:'Existing note'});
  assert.deepEqual(requestSchema.parse(legacy),legacy);
  assert.equal(requestSchema.safeParse({...base,classification:'workshop'}).success,false);
});
test('HTTP API enforces manager access, validates requests and atomically prevents double booking',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'studio-api-'));const port=3198;
  const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),STUDIO_DATA_DIR:dir,STUDIO_SEED:'false',STUDIO_MANAGER_PASSWORD:'test-manager-password',NODE_ENV:'production'},stdio:'pipe'});
  let logs='';child.stderr.on('data',v=>logs+=v);child.stdout.on('data',v=>logs+=v);
  t.after(async()=>{child.kill('SIGTERM');await new Promise<void>(resolve=>child.once('exit',()=>resolve()));rmSync(dir,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${port}`;let up=false;
  for(let i=0;i<80;i++){try{up=(await fetch(`${url}/api/health`)).ok;if(up)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(up,`Server failed to start: ${logs}`);
  const call=(path:string,body?:unknown,cookie='',method='POST')=>fetch(url+path,{method:body===undefined?'GET':method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal((await call('/api/config',defaultConfig(),'','PUT')).status,403);
  assert.equal((await call('/api/login',{password:'wrong'})).status,401);
  const login=await call('/api/login',{password:'test-manager-password'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
  const c={...defaultConfig(),wholeStudioLimit:100,escapeLimit:100,operationalReviewComplete:true,approvalReference:'TEST ONLY: API test configuration',verifiedClassifications:['meeting','workshop']};
  assert.equal((await call('/api/config',c,cookie,'PUT')).status,200);
  assert.equal((await call('/api/config',c,cookie,'PUT')).status,409,'stale rule versions must be rejected');
  const r=request({type:'meeting',classification:'meeting',participants:5});
  assert.equal((await call('/api/bookings',{request:{...r,participants:-1},zones:[7],status:'draft'})).status,400);
  assert.equal((await call('/api/bookings',{request:{...r,classification:'workshop'},zones:[7],status:'draft'})).status,400);
  assert.equal((await call('/api/bookings',{request:r,zones:[7],status:'confirmed'})).status,403);
  assert.equal((await call('/api/bookings',{request:r,zones:[1,7],status:'draft'})).status,409);
  const attempts=await Promise.all([call('/api/bookings',{request:r,zones:[7],status:'confirmed'},cookie),call('/api/bookings',{request:r,zones:[7],status:'confirmed'},cookie)]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
  const state=await (await call('/api/state')).json();assert.equal(state.bookings.length,1);assert.equal(state.bookings[0].status,'confirmed');
  assert.equal((await call(`/api/bookings/${state.bookings[0].id}/status`,{status:'cancelled'})).status,403);
  assert.equal((await call(`/api/bookings/${state.bookings[0].id}/status`,{status:'cancelled'},cookie)).status,200);
  assert.equal((await call('/api/bookings',{request:r,zones:[7],status:'confirmed'},cookie)).status,201);
  const crossOrigin=await fetch(url+'/api/logout',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://attacker.invalid',Cookie:cookie},body:'{}'});assert.equal(crossOrigin.status,403);
  const screening={name:'Film night',type:'screening',participants:20,start:'2027-03-01T10:00:00Z',end:'2027-03-01T12:00:00Z'};
  assert.equal((await call('/api/bookings',{request:screening,zones:[2],status:'draft'})).status,409);
  assert.equal((await call('/api/bookings',{request:{...screening,equipment:{}},zones:[3],status:'pending'})).status,409);
  const screenResponse=await call('/api/bookings',{request:screening,zones:[3],status:'pending'});assert.equal(screenResponse.status,201);assert.equal((await screenResponse.json()).classification,'meeting');
  const storage={items:'3 crates of tools',startDate:'2027-03-01',endDate:'2027-03-03'};
  assert.equal((await call('/api/storage',{...storage,items:' '})).status,400);
  assert.equal((await call('/api/storage',{...storage,status:'confirmed'})).status,403);
  const storageResponse=await call('/api/storage',storage);assert.equal(storageResponse.status,201);const saved=await storageResponse.json();assert.equal(saved.status,'pending');assert.equal(saved.reviewRequired,true);
  assert.equal((await call(`/api/storage/${saved.id}/status`,{status:'cancelled'})).status,403);
  assert.equal((await call(`/api/storage/${saved.id}/status`,{status:'confirmed'},cookie)).status,409);
  assert.equal((await call(`/api/storage/${saved.id}/status`,{status:'cancelled'},cookie)).status,200);
  const afterStorage=await (await call('/api/state')).json();assert.equal(afterStorage.storageRequests[0].status,'cancelled');assert.ok(afterStorage.bookings.length>0);
});
