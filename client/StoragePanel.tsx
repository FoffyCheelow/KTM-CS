import {useState} from 'react';
import {ArrowRight,Package} from 'lucide-react';
import {localNow} from '../shared/time.ts';
import type {StorageRequest} from '../shared/model.ts';
import {api} from './api.ts';
export default function StoragePanel({onSaved}:{onSaved:(request:StorageRequest)=>Promise<void>}) {
  const [items,setItems]=useState(''),[organisation,setOrganisation]=useState('');
  const [startDate,setStart]=useState(localNow().toISODate()!),[endDate,setEnd]=useState(localNow().plus({days:7}).toISODate()!);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <form className="storage-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const request=await api<StorageRequest>('/api/storage',{items,organisation,startDate,endDate,status:'pending'});await onSaved(request);setItems('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <div className="storage-location"><Package size={21}/><div><strong>Storage</strong><span>Existing rooms · first floor</span></div><span className="pill status-pending">Provisional</span></div>
    <div className="form-section"><label htmlFor="storage-items">Items to store</label><textarea id="storage-items" rows={4} value={items} onChange={e=>setItems(e.target.value)} placeholder="Describe the items and approximate quantity" required maxLength={5000}/><label htmlFor="storage-organisation">Course or organisation <span>Optional</span></label><input id="storage-organisation" value={organisation} onChange={e=>setOrganisation(e.target.value)} maxLength={200}/><div className="field-grid two"><div><label htmlFor="storage-start">From date</label><input id="storage-start" type="date" value={startDate} onChange={e=>setStart(e.target.value)} required/></div><div><label htmlFor="storage-end">Until date</label><input id="storage-end" type="date" min={startDate} value={endDate} onChange={e=>setEnd(e.target.value)} required/></div></div><p className="field-help">Both dates are included. Europe/London.</p></div>
    <div className="storage-review"><strong>Manager review required</strong><p>Storage provision and capacity are not yet confirmed. Requests are saved for review and do not guarantee space.</p></div>
    {error&&<p className="form-error" role="alert">{error}</p>}<div className="request-actions"><button className="primary" disabled={busy}>{busy?'Saving…':'Submit storage request'}<ArrowRight size={17}/></button></div>
  </form>;
}
