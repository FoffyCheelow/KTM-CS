import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { defaultConfig, zoneArea, type Booking, type Config, type Request, type Status, type StorageInput, type StorageRequest } from '../shared/model.ts';
import { storageInputSchema } from './schema.ts';
import { evaluate } from '../shared/engine.ts';
import { localToISO, localNow } from '../shared/time.ts';
export class BookingError extends Error { constructor(message: string, public details?: unknown, public code = 409) {super(message);} }
export class Store {
  db: DatabaseSync;
  constructor(path: string, seed = true) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS storage_requests(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, action TEXT NOT NULL, data TEXT NOT NULL);');
    const exists = this.db.prepare('SELECT data FROM config WHERE id=1').get();
    if (!exists) { this.db.prepare('INSERT INTO config VALUES(1,?)').run(JSON.stringify(defaultConfig())); if(seed) this.seed(); }
  }
  config(): Config { return JSON.parse((this.db.prepare('SELECT data FROM config WHERE id=1').get() as {data:string}).data); }
  bookings(): Booking[] {return (this.db.prepare('SELECT data FROM bookings ORDER BY rowid DESC').all() as {data:string}[]).map(r => JSON.parse(r.data));}
  storageRequests(): StorageRequest[] {return (this.db.prepare('SELECT data FROM storage_requests ORDER BY rowid DESC').all() as {data:string}[]).map(r => JSON.parse(r.data));}
  audit() {return this.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 150').all();}
  log(action: string, data: unknown) {this.db.prepare('INSERT INTO audit(timestamp,action,data) VALUES(?,?,?)').run(new Date().toISOString(),action,JSON.stringify(data));}
  transaction<T>(fn: () => T): T {this.db.exec('BEGIN IMMEDIATE'); try {const result=fn(); this.db.exec('COMMIT'); return result;} catch(e) {this.db.exec('ROLLBACK'); throw e;}}
  put(b: Booking) {this.db.prepare('INSERT OR REPLACE INTO bookings VALUES(?,?)').run(b.id,JSON.stringify(b));}
  create(r: Request, zones: number[], status: Status, manager: boolean): Booking {
    if ((status === 'confirmed' || status === 'cancelled') && !manager) throw new BookingError('Manager access is required.',undefined,403);
    return this.transaction(() => {
      const c = this.config(), result = evaluate(r,zones,this.bookings(),c);
      if (r.type !== 'dirty' && result.issues.some(i=>i.code==='disconnected')) throw new BookingError('A booking must select one connected group of complete zones.',result);
      if (r.type === 'dirty' && zones.length) throw new BookingError('Dirty workshop reservations cannot include flexible zones.',result);
      if (r.type === 'screening' && result.issues.some(i=>i.code==='screening-zones')) throw new BookingError('Screenings must occupy Zone 3; only Zones 2 and 4 can be added.',result);
      if (status === 'confirmed' && !result.canConfirm) throw new BookingError('Confirmation is blocked by unresolved checks.',result);
      if (c.reserveStatuses.includes(status) && result.issues.some(i=>i.severity==='error')) throw new BookingError('Resolve planning conflicts before requesting a space reservation. You can save a draft.',result);
      const b: Booking = {...r, zones, status, id:randomUUID(), createdAt:new Date().toISOString(),ruleVersion:c.version,areaAtSave:result.area,demo:false,requiresRevalidation:false};
      this.put(b); this.log('booking.created',{id:b.id,name:b.name,status,zones,ruleVersion:c.version,area:result.area}); return b;
    });
  }
  createStorage(input: StorageInput, status: Status, manager: boolean): StorageRequest {
    const request = storageInputSchema.parse(input);
    if ((status === 'confirmed' || status === 'cancelled') && !manager) throw new BookingError('Manager access is required.',undefined,403);
    if (status === 'confirmed') throw new BookingError('Storage provision and capacity are unverified. Requests require review and cannot be confirmed yet.');
    return this.transaction(() => {
      const value: StorageRequest = {...request, id: randomUUID(), status, createdAt: new Date().toISOString(), reviewRequired: true};
      this.db.prepare('INSERT INTO storage_requests VALUES(?,?)').run(value.id,JSON.stringify(value));
      this.log('storage.created',{id:value.id,items:value.items,startDate:value.startDate,endDate:value.endDate,status});
      return value;
    });
  }
  changeStorageStatus(id: string, status: Status): StorageRequest {
    return this.transaction(() => {
      const value = this.storageRequests().find(request=>request.id===id);
      if (!value) throw new BookingError('Storage request not found.',undefined,404);
      if (status === 'confirmed') throw new BookingError('Storage provision and capacity are unverified. Requests require review and cannot be confirmed yet.');
      const next: StorageRequest = {...value,status,reviewRequired:true};
      this.db.prepare('UPDATE storage_requests SET data=? WHERE id=?').run(JSON.stringify(next),id);
      this.log('storage.status',{id,from:value.status,to:status});
      return next;
    });
  }
  changeStatus(id: string, status: Status): Booking {
    return this.transaction(() => {
      const c=this.config(), b=this.bookings().find(b=>b.id===id);
      if(!b) throw new BookingError('Booking not found.',undefined,404);
      const evaluation=evaluate(b,b.zones,this.bookings(),c,id);
      if(status==='confirmed' && !evaluation.canConfirm) throw new BookingError('Confirmation is blocked by unresolved checks.',evaluation);
      if(c.reserveStatuses.includes(status) && evaluation.issues.some(i=>i.severity==='error')) throw new BookingError('This reservation conflicts with the current plan.',evaluation);
      const next={...b,status,ruleVersion:c.version,areaAtSave:evaluation.area,requiresRevalidation:false}; this.put(next); this.log('booking.status',{id,from:b.status,to:status,ruleVersion:c.version});return next;
    });
  }
  updateConfig(next: Config): Config {
    return this.transaction(()=> {
      const previous=this.config();
      if(next.version!==previous.version) throw new BookingError('Rules changed in another session. Reload settings before saving.');
      next={...next,version:previous.version+1};this.db.prepare('UPDATE config SET data=? WHERE id=1').run(JSON.stringify(next));
      for(const b of this.bookings()) if(Date.parse(b.end) >= Date.now() && b.status!=='cancelled') this.put({...b,requiresRevalidation:true});
      this.log('rules.updated',{previousVersion:previous.version,version:next.version,previous,next}); return next;
    });
  }
  seed() {
    const date=localNow().toISODate()!;
    const request=(name:string,type:Request['type'],start:string,end:string,participants:number): Request=>({name,organisation:type==='exhibition'?'Creative Health Camden':'Community Studio · demo',type,classification:type==='clean'?'workshop':type==='exhibition'?'gallery':'meeting',layout:'Collaborative tables',participants,staff:0,visitors:0,start:localToISO(`${date}T${start}`),end:localToISO(`${date}T${end}`),setup:15,packdown:15,equipment:{},accessibility:'Keep protected routes clear.',notes:'Labelled demonstration data; not a real booking or operational approval.',minimumArea:0,practicalArea:0,preferredZones:[]});
    for(const [r,zones] of [[request('Making together','clean','09:00','12:00',8),[1,2]], [request('Drawn Together · installation','exhibition','14:00','18:00',6),[3,8]], [request('Neighbourhood catch-up','meeting','13:00','14:00',5),[7]]] as [Request,number[]][]) {
      this.put({...r,zones,id:randomUUID(),status:'pending',ruleVersion:1,areaAtSave:zoneArea(zones,this.config()),createdAt:new Date().toISOString(),demo:true,requiresRevalidation:false});
    }
    this.log('demo.seeded',{date});
  }
  close() {this.db.close();}
}
