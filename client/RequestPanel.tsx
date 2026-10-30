import {ArrowRight,Check,ChevronDown,Info,Printer} from 'lucide-react';
import {TYPES,type ActivityType,type Config,type Evaluation,type Proposal,type Status} from '../shared/model.ts';
import type {Fallback} from '../shared/engine.ts';
import {dimensions} from '../shared/dimensions.ts';

export interface Form {
  name:string; organisation:string; type:ActivityType; participants:number; staff:number; visitors:number;
  start:string; end:string; setup:number; packdown:number; equipment:Record<string,number>;
}
export default function RequestPanel({form,setForm,config,proposal,result,manual,onAuto,onAlternative,onSave,saving,onPrint,fallbacks,onFallback}:{
  form:Form;setForm:(form:Form)=>void;config:Config;proposal:Proposal;result:Evaluation;manual:boolean;
  onAuto:()=>void;onAlternative:(ids:number[])=>void;onSave:(status:Status)=>void;saving:boolean;
  onPrint:()=>void;fallbacks:Fallback[];onFallback:(fallback:Fallback)=>void;
}) {
  const update=<K extends keyof Form>(key:K,value:Form[K])=>setForm({...form,[key]:value});
  const changeType=(type:ActivityType)=>setForm({...form,type,participants:type==='meeting'?5:type==='screening'?20:type==='exhibition'?30:20,equipment:type==='screening'?{...form.equipment,Projector:1}:form.equipment});
  const size=dimensions(result.zones,config,form.type);
  const outcome=result.outcome==='cannot'?'Cannot accommodate as requested':result.outcome==='review'?'Requires review':'Fits planning constraints';
  const shortfall=result.shortfall<.5?'Less than 1':Math.round(result.shortfall);
  return <form className="activity-form" onSubmit={event=>{event.preventDefault();onSave('pending');}}>
    <div className="form-section">
      <label htmlFor="activity-name">Activity name</label>
      <input id="activity-name" value={form.name} onChange={e=>update('name',e.target.value)} required maxLength={160} placeholder="Enter activity name"/>
      <label htmlFor="organisation">Course or organisation <span>Optional</span></label>
      <input id="organisation" value={form.organisation} onChange={e=>update('organisation',e.target.value)} maxLength={200}/>
      <fieldset><legend>Activity type</legend><div className="activity-types">{(Object.keys(TYPES) as ActivityType[]).map(type=><button type="button" key={type} aria-pressed={form.type===type} className={form.type===type?'selected':''} onClick={()=>changeType(type)}><span>{TYPES[type]}</span>{form.type===type&&<Check size={14}/>}</button>)}</div></fieldset>
      {form.type==='screening'&&<p className="field-help screening-note">Zone 3 is required. Add Zone 2 and/or 4 if needed. A projector or screen is required.</p>}
    </div>
    <div className="form-section"><div className="section-label"><h3>People</h3><span>{result.people} total</span></div>
      <div className="field-grid three">{(['participants','staff','visitors'] as const).map(key=><div key={key}><label htmlFor={key}>{key==='staff'?'Staff / tutors':key[0].toUpperCase()+key.slice(1)}</label><input id={key} type="number" min="0" max="10000" value={form[key]} onChange={e=>update(key,Math.max(0,Number(e.target.value)))}/></div>)}</div>
    </div>
    <div className="form-section"><h3>Date & time</h3><label htmlFor="start">Start</label><input id="start" type="datetime-local" value={form.start} onChange={e=>update('start',e.target.value)} required/><label htmlFor="end">End</label><input id="end" type="datetime-local" value={form.end} onChange={e=>update('end',e.target.value)} required/>
      <div className="field-grid two timing-buffers"><div><label htmlFor="setup">Setup (minutes)</label><input id="setup" type="number" min="0" max="10080" value={form.setup} onChange={e=>update('setup',Number(e.target.value))}/></div><div><label htmlFor="packdown">Pack-down (minutes)</label><input id="packdown" type="number" min="0" max="10080" value={form.packdown} onChange={e=>update('packdown',Number(e.target.value))}/></div></div><p className="field-help">Europe/London. Setup and pack-down reserve the same zones.</p>
    </div>
    <details className="form-details" open={form.type==='screening'}><summary>Equipment <ChevronDown size={15}/></summary><div className="equipment-grid">{Object.entries(config.equipment).map(([name,stock])=><label key={name}>{name}<span><input aria-label={`${name} quantity`} type="number" min="0" max={stock} value={form.equipment[name]||0} onChange={e=>update('equipment',{...form.equipment,[name]:Number(e.target.value)})}/><small> / {stock}</small></span></label>)}</div></details>
    <section className="proposal-box" aria-label="Allocation proposal"><div className="proposal-heading"><h3>{manual?'Your selection':proposal.preferred?'Preferred proposal':'Suggested space'}</h3>{manual&&<button type="button" onClick={onAuto}>Auto-select</button>}</div><div className="zone-chips">{form.type==='dirty'?<span>Dirty workshop</span>:result.zones.map(id=><span key={id}>Zone {id}</span>)}</div>
      <div className="allocation-stats"><div><strong>{Math.round(result.area)}<small> m²</small></strong><span>Area</span></div><div><strong>{result.zones.length||'—'}</strong><span>Zones</span></div><div><strong>{result.people}</strong><span>People</span></div></div>
      <div className="dimension-summary"><span>Overall dimensions</span><strong>{size?.label || 'Calibration required'}</strong><small>Bounding width × depth{size?' · approximate':''}</small></div>
      <div className={`outcome ${result.outcome}`}><Info size={15}/><strong>{outcome}</strong></div>
      {result.shortfall>0&&<p className="shortfall"><strong>{shortfall} m² more space needed.</strong> {Math.round(result.area)} m² allocated / {Math.round(result.requiredArea)} m² required.</p>}
      {proposal.alternatives.length>0&&result.outcome==='cannot'&&<div className="alternatives"><span>Connected alternatives</span>{proposal.alternatives.slice(0,2).map((alt,i)=><button key={i} type="button" onClick={()=>onAlternative(alt.zones)}><span>{result.zones.every(z=>alt.zones.includes(z))?`Add Zone ${alt.zones.filter(z=>!result.zones.includes(z)).join(' + ')}`:`Use Zones ${alt.zones.join(', ')}`}<small>{Math.round(alt.area)} m² · {alt.zones.length} zones</small></span><ArrowRight size={16}/></button>)}</div>}
      {fallbacks.length>0&&<div className="alternatives"><span>Other options</span>{fallbacks.map((fallback,i)=><button key={i} type="button" onClick={()=>onFallback(fallback)}><span>{fallback.label}<small>{fallback.description}</small></span><ArrowRight size={16}/></button>)}</div>}
      <details className="calculations"><summary>Checks & calculations <ChevronDown size={14}/></summary><dl><dt>People</dt><dd>{form.participants} + {form.staff} + {form.visitors} = {result.people}</dd><dt>Indicative area</dt><dd>{Math.round(result.indicativeArea)} m²</dd><dt>Required area</dt><dd>{Math.round(result.requiredArea)} m²</dd><dt>Area-based estimate</dt><dd>{result.planningHeadcount} people · not an approved limit</dd></dl><ul>{result.issues.map((issue,i)=><li key={i} className={issue.severity}>{issue.message}</li>)}</ul></details>
    </section>
    <div className="request-actions"><button className="primary" type="submit" disabled={saving||result.outcome==='cannot'}>{saving?'Saving…':'Request space'}<ArrowRight size={17}/></button><div><button className="secondary" type="button" disabled={saving||(!result.zones.length&&form.type!=='dirty')} onClick={()=>onSave('draft')}>Save draft</button><button className="icon-button" type="button" aria-label="Print allocation summary" onClick={onPrint}><Printer size={17}/></button></div><p>Pending requests reserve space. Drafts {config.reserveStatuses.includes('draft')?'reserve space.':'do not reserve space.'}</p></div>
  </form>;
}
