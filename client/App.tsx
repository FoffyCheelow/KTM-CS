import {useEffect,useMemo,useState} from 'react';
import {DateTime} from 'luxon';
import {ArrowRight,CalendarDays,Check,ChevronLeft,ChevronRight,Grid2X2,Info,LoaderCircle,LockKeyhole,LogOut,Package,Plus,Printer,Search,Settings2,X} from 'lucide-react';
import {defaultConfig,TYPES,totalPeople,reservation,attendance,overlaps,type Booking,type Config,type Request,type Status,type StorageRequest} from '../shared/model.ts';
import {evaluate,propose,findFallbacks} from '../shared/engine.ts';
import {dimensions} from '../shared/dimensions.ts';
import {localNow,localToISO,formatTime,ZONE} from '../shared/time.ts';
import Plan from './Plan.tsx';
import RequestPanel,{type Form} from './RequestPanel.tsx';
import StoragePanel from './StoragePanel.tsx';
import Settings from './Settings.tsx';
import Dialog from './Dialog.tsx';
import {api} from './api.ts';

function initialForm():Form {
  const date=localNow().toISODate();
  return {name:'',organisation:'',type:'clean',participants:20,staff:0,visitors:0,start:`${date}T10:00`,end:`${date}T12:00`,setup:15,packdown:15,equipment:{}};
}
function toRequest(f:Form):Request {
  return {...f,name:f.name.trim()||'Untitled activity',classification:f.type==='clean'||f.type==='dirty'?'workshop':f.type==='exhibition'?'exhibition':'meeting',layout:'Standard',start:localToISO(f.start),end:localToISO(f.end),accessibility:'',notes:'',minimumArea:0,practicalArea:0,preferredZones:[]};
}
const dateLabel=(value:string)=>DateTime.fromISO(value).setZone(ZONE).toFormat('d LLL yyyy');
const sizeLabel=(booking:Booking,config:Config)=>dimensions(booking.zones,config,booking.type)?.label||'Dimensions need calibration';

export default function App() {
  const [config,setConfig]=useState(defaultConfig),[bookings,setBookings]=useState<Booking[]>([]),[storage,setStorage]=useState<StorageRequest[]>([]),[manager,setManager]=useState(false);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[form,setForm]=useState(initialForm),[manual,setManual]=useState<number[]|null>(null);
  const [screen,setScreen]=useState<'planner'|'bookings'>('planner'),[mode,setMode]=useState<'activity'|'storage'>('activity');
  const [inspected,setInspected]=useState<number|null>(null),[highlight,setHighlight]=useState<string|null>(null),[detail,setDetail]=useState<string|null>(null),[storageDetail,setStorageDetail]=useState<string|null>(null);
  const [settings,setSettings]=useState(false),[login,setLogin]=useState(false),[password,setPassword]=useState(''),[loginError,setLoginError]=useState(''),[detailError,setDetailError]=useState('');
  const [busy,setBusy]=useState(false),[toast,setToast]=useState(''),[filter,setFilter]=useState('all'),[query,setQuery]=useState('');

  async function refresh() {
    try {const state=await api<{config:Config;bookings:Booking[];storageRequests:StorageRequest[];manager:boolean}>('/api/state');setConfig(state.config);setBookings(state.bookings);setStorage(state.storageRequests||[]);setManager(state.manager);setLoadError('');}
    catch(error){setLoadError((error as Error).message);throw error;}
  }
  useEffect(()=>{refresh().catch(()=>{}).finally(()=>setLoading(false));const timer=setInterval(()=>refresh().catch(()=>{}),30000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),6000);return()=>clearTimeout(timer);},[toast]);
  const parsed=useMemo(()=>{try{const request=toRequest(form);if(Date.parse(request.end)<=Date.parse(request.start))throw new Error('End must be after start.');return {request,error:''};}catch(error){return {request:toRequest(initialForm()),error:(error as Error).message};}},[form]);
  const request=parsed.request;
  const proposal=useMemo(()=>propose(request,bookings,config),[request,bookings,config]);
  const result=useMemo(()=>manual===null?proposal.selected:evaluate(request,manual,bookings,config),[request,manual,proposal,bookings,config]);
  const fallbacks=useMemo(()=>result.outcome==='cannot'&&!proposal.alternatives.length?findFallbacks(request,bookings,config):[],[request,result,proposal,bookings,config]);
  const date=DateTime.fromISO(form.start).isValid?form.start.slice(0,10):localNow().toISODate()!;
  const day=DateTime.fromISO(date,{zone:ZONE});
  const dayInterval:[number,number]=[day.startOf('day').toMillis(),day.plus({days:1}).startOf('day').toMillis()];
  const daily=bookings.filter(b=>b.status!=='cancelled'&&overlaps(reservation(b),dayInterval)).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  const dayOccupancy=useMemo(()=>{const active=bookings.filter(b=>config.reserveStatuses.includes(b.status)&&overlaps(attendance(b),dayInterval));const ticks=[dayInterval[0],...active.flatMap(attendance)].filter(t=>t>=dayInterval[0]&&t<dayInterval[1]);return Math.max(0,...ticks.map(t=>active.filter(b=>attendance(b)[0]<=t&&t<attendance(b)[1]).reduce((n,b)=>n+totalPeople(b),0)));},[bookings,config,date]);
  const selectedBooking=bookings.find(b=>b.id===detail);
  const selectedEvaluation=selectedBooking?evaluate(selectedBooking,selectedBooking.zones,bookings,config,selectedBooking.id):null;
  const selectedStorage=storage.find(s=>s.id===storageDetail);
  const selectedSize=dimensions(result.zones,config,form.type);

  function changeDate(value:string) {
    if(!value)return;
    const delta=DateTime.fromISO(value).diff(DateTime.fromISO(date),'days').days;
    setForm({...form,start:`${value}T${form.start.slice(11)}`,end:DateTime.fromISO(form.end).plus({days:delta}).toFormat("yyyy-MM-dd'T'HH:mm")});setInspected(null);
  }
  async function onSave(status:Status) {
    if(!form.name.trim()){document.getElementById('activity-name')?.focus();setToast('Enter an activity name.');return;}
    if(parsed.error){setToast(parsed.error);return;}
    setBusy(true);
    try {const booking=await api<Booking>('/api/bookings',{request:toRequest(form),zones:result.zones,status});await refresh();setToast(status==='draft'?'Draft saved.':'Space requested. Manager review required.');setDetail(booking.id);setDetailError('');setManual(null);}
    catch(error){setToast((error as Error).message);await refresh().catch(()=>{});}finally{setBusy(false);}
  }
  async function changeStatus(status:Status) {
    setBusy(true);setDetailError('');
    try {await api(`/api/bookings/${detail}/status`,{status});await refresh();setToast(`Booking ${status}.`);}catch(error){setDetailError((error as Error).message);}finally{setBusy(false);}
  }
  function selectZone(id:number) {
    setInspected(id);
    const booked=bookings.find(b=>config.reserveStatuses.includes(b.status)&&b.zones.includes(id)&&overlaps(reservation(request),reservation(b)));
    if(booked){setHighlight(booked.id);return;}
    setHighlight(null);
    if(config.zones.find(z=>z.id===id)?.unavailable||form.type==='dirty'||mode==='storage')return;
    if(form.type==='screening'&&(![2,3,4].includes(id)||id===3)){setToast(id===3?'Screenings must include Zone 3.':'Screenings use Zone 3, with optional Zones 2 and 4.');return;}
    const base=manual??result.zones;
    setManual(base.includes(id)?base.filter(z=>z!==id):[...base,id].sort((a,b)=>a-b));
  }
  function openBooking(booking:Booking){setDetail(booking.id);setDetailError('');setHighlight(booking.id);}
  const filtered=bookings.filter(b=>(filter==='all'||filter===b.status)&&`${b.name} ${b.organisation}`.toLowerCase().includes(query.toLowerCase()));
  const filteredStorage=storage.filter(s=>(filter==='all'||filter===s.status)&&`${s.items} ${s.organisation}`.toLowerCase().includes(query.toLowerCase()));
  if(loading)return <div className="loading"><LoaderCircle className="spin" size={24}/><p>Loading studio…</p></div>;
  if(loadError&&!bookings.length)return <div className="loading"><h1>Unable to load studio</h1><p>{loadError}</p><button className="primary" onClick={()=>{setLoading(true);refresh().catch(()=>{}).finally(()=>setLoading(false));}}>Retry</button></div>;

  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="#planner" onClick={e=>{e.preventDefault();setScreen('planner');}} aria-label="Community Studio home"><Grid2X2 size={25}/><span>COMMUNITY<br/>STUDIO</span></a>
      <nav aria-label="Main navigation"><button className={screen==='planner'?'active':''} onClick={()=>setScreen('planner')}>Studio planner</button><button className={screen==='bookings'?'active':''} onClick={()=>setScreen('bookings')}>Bookings<span>{bookings.filter(b=>b.status!=='cancelled').length+storage.filter(s=>s.status!=='cancelled').length}</span></button></nav>
      <div className="header-actions"><button className="icon-button" aria-label="Studio settings" title="Studio settings" onClick={()=>setSettings(true)}><Settings2 size={19}/></button><button className="account-button" aria-label={manager?'Sign out':'Manager sign in'} onClick={async()=>{if(manager){await api('/api/logout',{});await refresh();setToast('Signed out.');}else{setLoginError('');setLogin(true);}}}>{manager?<LogOut size={16}/>:<LockKeyhole size={16}/>}<span>{manager?'Manager':'Sign in'}</span></button></div>
    </header>
    <main>
      <div className="page-heading"><div><div className="eyebrow">KENTISH TOWN MEANWHILE / FIRST FLOOR</div><h1>{screen==='planner'?'Studio planner':'Bookings'}</h1></div><div className="heading-actions">{screen==='planner'?<button className="secondary" onClick={()=>window.print()}><Printer size={16}/>Print plan</button>:<button className="primary" onClick={()=>{setScreen('planner');setMode('activity');}}><Plus size={17}/>New request</button>}</div></div>
      {loadError&&<p className="form-error" role="alert">Updates unavailable: {loadError}</p>}
      {screen==='planner'&&<>
        <div className="planner-controls"><div className="date-control"><button className="icon-button" aria-label="Previous day" onClick={()=>changeDate(day.minus({days:1}).toISODate()!)}><ChevronLeft size={19}/></button><label className="date-picker"><CalendarDays size={17}/><span>{day.toFormat('ccc, d LLL yyyy')}</span><input aria-label="Planning date" type="date" value={date} onChange={e=>changeDate(e.target.value)}/></label><button className="icon-button" aria-label="Next day" onClick={()=>changeDate(day.plus({days:1}).toISODate()!)}><ChevronRight size={19}/></button><button className="today-button" onClick={()=>changeDate(localNow().toISODate()!)}>Today</button></div><div className="time-window">{form.start.slice(11)} — {form.end.slice(0,10)!==date?`${DateTime.fromISO(form.end).toFormat('d LLL')} `:''}{form.end.slice(11)}<span>Europe/London</span></div></div>
        <div className="planner-grid"><section className="workspace"><div className="space-stats"><div><strong>{proposal.available.length}<small>/10</small></strong><span>Zones available</span></div><div><strong>{dayOccupancy}</strong><span>Peak booked attendance</span></div><div className="size-stat"><strong>{selectedSize?.label||'Uncalibrated'}</strong><span>Selected overall dimensions</span></div></div>
          <section className="floor-card"><div className="section-heading"><h2>Floor plan</h2><span className="pill neutral">{mode==='storage'?'Storage request':`Proposed · ${Math.round(result.area)} m²`}</span></div><Plan config={config} bookings={bookings} request={request} selected={result} onZone={selectZone} inspected={inspected} onInspect={setInspected} highlight={highlight} storageSelected={mode==='storage'} onStorage={()=>setMode('storage')}/></section>
          <section className="schedule-card"><div className="section-heading"><h2>Daily schedule <span className="count-badge">{daily.length}</span></h2><button className="text-button" onClick={()=>setScreen('bookings')}>All bookings <ArrowRight size={15}/></button></div><div className="timeline-hours"><span>Activity</span>{[8,10,12,14,16,18,20].map(hour=><button key={hour} onClick={()=>setForm({...form,start:`${date}T${String(hour).padStart(2,'0')}:00`,end:`${date}T${String(Math.min(23,hour+2)).padStart(2,'0')}:00`})}>{hour}:00</button>)}</div>
            {daily.map(booking=>{const start=DateTime.fromISO(booking.start).setZone(ZONE),end=DateTime.fromISO(booking.end).setZone(ZONE);const left=Math.max(0,Math.min(100,(start.diff(day.startOf('day'),'hours').hours-8)/12*100)),right=Math.max(left,Math.min(100,(end.diff(day.startOf('day'),'hours').hours-8)/12*100));return <button key={booking.id} className={`timeline-row ${highlight===booking.id?'highlighted':''}`} onClick={()=>openBooking(booking)} onMouseEnter={()=>setHighlight(booking.id)} onMouseLeave={()=>setHighlight(null)}><span className="timeline-name"><i className={`type-dot ${booking.type}`}/><span><strong>{booking.name}</strong><small>{booking.demo?'DEMO · ':''}{totalPeople(booking)} people · {booking.type==='dirty'?'Dirty workshop':`Zones ${booking.zones.join(', ')}`}</small></span></span><span className="timeline-track"><span className={`timeline-block ${booking.type}`} style={{left:`${left}%`,width:`${Math.max(2,right-left)}%`}}>{formatTime(booking.start)}–{formatTime(booking.end)}</span></span></button>;})}
            {!daily.length&&<p className="empty-state">No activities on this date.</p>}<div className="schedule-footer">Pending requests reserve zones. Setup and pack-down are included.</div>
          </section>
          <section className="storage-overview"><div className="section-heading"><h2>Storage</h2><button className="text-button" onClick={()=>setMode('storage')}>Request storage <Plus size={15}/></button></div>{storage.filter(s=>s.status!=='cancelled'&&s.startDate<=date&&s.endDate>=date).map(s=><button className="storage-list-row" key={s.id} onClick={()=>{setStorageDetail(s.id);setDetailError('');}}><Package size={17}/><span><strong>{s.items}</strong><small>{dateLabel(s.startDate)} — {dateLabel(s.endDate)}</small></span><span className={`pill status-${s.status}`}>{s.status}</span></button>)}<p className="storage-caption">Provisional provision · all requests require review</p></section>
          <p className="planning-note"><Info size={15}/>Areas and routes are provisional. Manager approval is required for confirmation.</p>
        </section>
        <aside className="request-column"><div className="request-panel"><div className="request-tabs"><button className={mode==='activity'?'active':''} aria-pressed={mode==='activity'} onClick={()=>setMode('activity')}>Plan activity</button><button className={mode==='storage'?'active':''} aria-pressed={mode==='storage'} onClick={()=>setMode('storage')}>Request storage</button></div>{mode==='activity'?<>{parsed.error&&<p className="form-error" role="alert">{parsed.error}</p>}<RequestPanel form={form} setForm={next=>{if(next.type!==form.type){setManual(null);setInspected(null);}setForm(next);}} config={config} proposal={proposal} result={result} manual={manual!==null} onAuto={()=>{setManual(null);setHighlight(null);}} onAlternative={ids=>{setManual(ids);setInspected(null);}} fallbacks={fallbacks} onFallback={fallback=>{const r=fallback.request;const local=(iso:string)=>DateTime.fromISO(iso).setZone(ZONE).toFormat("yyyy-MM-dd'T'HH:mm");setForm({...form,participants:r.participants,start:local(r.start),end:local(r.end)});setManual(fallback.zones);}} onSave={onSave} saving={busy||!!parsed.error} onPrint={()=>window.print()}/></>:<StoragePanel onSaved={async saved=>{await refresh();setStorageDetail(saved.id);setDetailError('');setToast('Storage request submitted for review.');}}/>}</div></aside></div>
      </>}
      {screen==='bookings'&&<section className="bookings-page"><div className="booking-filters"><div className="search"><Search size={17}/><input aria-label="Search bookings" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search requests"/></div><div className="segmented">{['all','pending','confirmed','draft','cancelled'].map(status=><button key={status} className={filter===status?'active':''} onClick={()=>setFilter(status)}>{status[0].toUpperCase()+status.slice(1)}</button>)}</div></div><h2 className="list-heading">Activities</h2><div className="booking-table"><div className="booking-table-head"><span>Activity</span><span>Date</span><span>Space / dimensions</span><span>People</span><span>Status</span><span/></div>{filtered.map(b=><button className="booking-table-row" key={b.id} onClick={()=>openBooking(b)}><span className="activity-cell"><i className={`type-dot ${b.type}`}/><span><strong>{b.name}</strong><small>{b.demo?'DEMO · ':''}{b.organisation||TYPES[b.type]}{b.requiresRevalidation?' · Revalidate':''}</small></span></span><span>{dateLabel(b.start)}<small>{formatTime(b.start)}–{dateLabel(b.start)!==dateLabel(b.end)?`${dateLabel(b.end)} `:''}{formatTime(b.end)}</small></span><span>{b.type==='dirty'?'Dirty workshop':`Zones ${b.zones.join(', ')}`} · {Math.round(b.areaAtSave)} m²<small>{sizeLabel(b,config)}</small></span><span>{totalPeople(b)}</span><span className={`pill status-${b.status}`}>{b.status}</span><ChevronRight size={17}/></button>)}{!filtered.length&&<p className="empty-state">No matching activities.</p>}</div>
        <h2 className="list-heading">Storage requests</h2><div className="storage-table">{filteredStorage.map(s=><button key={s.id} className="storage-list-row" onClick={()=>{setStorageDetail(s.id);setDetailError('');}}><Package size={18}/><span><strong>{s.items}</strong><small>{s.organisation||'Storage'} · {dateLabel(s.startDate)} — {dateLabel(s.endDate)} · Review required</small></span><span className={`pill status-${s.status}`}>{s.status}</span><ChevronRight size={17}/></button>)}{!filteredStorage.length&&<p className="empty-state">No matching storage requests.</p>}</div>
      </section>}
      <footer className="page-footer"><span>Community Studio / Kentish Town Meanwhile</span><span>Europe/London</span></footer>
    </main>
    {toast&&<div className="toast" role="status"><Info size={17}/><span>{toast}</span><button aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={17}/></button></div>}
    {settings&&<Settings config={config} manager={manager} onClose={()=>setSettings(false)} onRefresh={refresh} onLogin={()=>{setSettings(false);setLoginError('');setLogin(true);}}/>}
    {login&&<Dialog title="Manager sign in" onClose={()=>setLogin(false)}><form onSubmit={async e=>{e.preventDefault();setBusy(true);setLoginError('');try{await api('/api/login',{password});setPassword('');setLogin(false);await refresh();setSettings(true);}catch(error){setLoginError((error as Error).message);}finally{setBusy(false);}}}><label htmlFor="manager-password">Manager password</label><input id="manager-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/>{loginError&&<p className="form-error" role="alert">{loginError}</p>}<p className="field-help">Your password is in the app folder at <code>.data/manager-password</code>.</p><button className="primary login-button" disabled={busy}>Sign in <ArrowRight size={16}/></button></form></Dialog>}
    {selectedBooking&&selectedEvaluation&&<Dialog title="Activity details" wide onClose={()=>{setDetail(null);setHighlight(null);}}><div className="booking-detail"><div className="detail-heading"><span className={`pill status-${selectedBooking.status}`}>{selectedBooking.status}</span>{selectedBooking.demo&&<span className="pill neutral">Demo</span>}{selectedBooking.requiresRevalidation&&<span className="pill status-pending">Revalidation required</span>}</div><h2>{selectedBooking.name}</h2><p>{selectedBooking.organisation} · {TYPES[selectedBooking.type]}</p><div className="detail-grid"><div><span>Allocated space</span><strong>{selectedBooking.type==='dirty'?'Dirty workshop':`Zones ${selectedBooking.zones.join(', ')}`}</strong><small>{Math.round(selectedEvaluation.area)} m² · {sizeLabel(selectedBooking,config)}</small></div><div><span>People</span><strong>{totalPeople(selectedBooking)} total</strong><small>{selectedBooking.participants} participants · {selectedBooking.staff} staff · {selectedBooking.visitors} visitors</small></div><div><span>Activity</span><strong>{dateLabel(selectedBooking.start)}, {formatTime(selectedBooking.start)}</strong><small>Until {dateLabel(selectedBooking.end)}, {formatTime(selectedBooking.end)}</small></div><div><span>Reservation</span><strong>{selectedBooking.setup} min setup · {selectedBooking.packdown} min pack-down</strong><small>Rule version {selectedBooking.ruleVersion} · {config.reserveStatuses.includes(selectedBooking.status)?'Reserves space':'Does not reserve space'}</small></div></div>{Object.values(selectedBooking.equipment).some(q=>q>0)&&<p>Equipment: {Object.entries(selectedBooking.equipment).filter(([,q])=>q>0).map(([k,q])=>`${q} × ${k}`).join(', ')}</p>}<div className={`outcome ${selectedEvaluation.outcome}`}><Info size={16}/><strong>{selectedEvaluation.outcome==='fits'?'Fits planning constraints':selectedEvaluation.outcome==='review'?'Requires review':'Cannot accommodate under current rules'}</strong></div><ul className="detail-issues">{selectedEvaluation.issues.map((issue,i)=><li key={i}>{issue.message}</li>)}</ul>{detailError&&<p className="form-error" role="alert">{detailError}</p>}<div className="detail-actions">{manager?<><button className="secondary" disabled={busy||selectedBooking.status==='cancelled'} onClick={()=>changeStatus('cancelled')}>Cancel booking</button><button className="secondary" disabled={busy||selectedBooking.status==='pending'} onClick={()=>changeStatus('pending')}>Mark pending</button><button className="primary" disabled={busy||!selectedEvaluation.canConfirm||selectedBooking.status==='confirmed'&&!selectedBooking.requiresRevalidation} onClick={()=>changeStatus('confirmed')}><Check size={16}/>Confirm booking</button></>:<button className="secondary" onClick={()=>{setDetail(null);setLogin(true);}}>Manager sign in <LockKeyhole size={14}/></button>}</div></div></Dialog>}
    {selectedStorage&&<Dialog title="Storage request" onClose={()=>setStorageDetail(null)}><div className="storage-detail"><span className={`pill status-${selectedStorage.status}`}>{selectedStorage.status}</span><h3>Items to store</h3><p className="stored-items">{selectedStorage.items}</p><dl><dt>Date range</dt><dd>{dateLabel(selectedStorage.startDate)} — {dateLabel(selectedStorage.endDate)} (inclusive)</dd>{selectedStorage.organisation&&<><dt>Course or organisation</dt><dd>{selectedStorage.organisation}</dd></>}</dl><p className="storage-review">Storage provision and capacity are unconfirmed. This request requires manager review and does not guarantee space.</p>{detailError&&<p className="form-error" role="alert">{detailError}</p>}{manager&&selectedStorage.status!=='cancelled'&&<button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await api(`/api/storage/${selectedStorage.id}/status`,{status:'cancelled'});await refresh();}catch(error){setDetailError((error as Error).message);}finally{setBusy(false);}}}>Cancel request</button>}</div></Dialog>}
    <section className="print-summary"><h1>Community Studio / Allocation</h1><h2>{form.name||'Untitled activity'}</h2><p>{TYPES[form.type]} · {form.organisation}</p><p>{form.start.replace('T',' ')} — {form.end.replace('T',' ')} · Europe/London</p><p>{form.type==='dirty'?'Dirty workshop':`Zones ${result.zones.join(', ')}`} · {Math.round(result.area)} m² · {result.people} people</p><p>Overall dimensions: {selectedSize?.label||'Dimensions need calibration'}</p><p>Required area: {Math.round(result.requiredArea)} m²</p><ul>{result.issues.map((issue,i)=><li key={i}>{issue.message}</li>)}</ul><p>Provisional planning. Rule version {config.version}. Routes must remain clear.</p></section>
  </div>;
}
