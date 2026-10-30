import {useRef,useState} from 'react';
import {Hand,Info,Maximize2,Minus,Plus,RotateCcw} from 'lucide-react';
import {type Booking,type Config,type Evaluation,type Request,reservation,overlaps} from '../shared/model.ts';
import {dimensions,zoneBounds} from '../shared/dimensions.ts';
interface PlanProps {
  config:Config;bookings:Booking[];request:Request;selected:Evaluation;
  onZone:(id:number)=>void;inspected:number|null;highlight:string|null;onInspect:(id:number|null)=>void;
  storageSelected:boolean;onStorage:()=>void;
}
export default function Plan({config,bookings,request,selected,onZone,inspected,highlight,onInspect,storageSelected,onStorage}:PlanProps) {
  const [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),[panMode,setPanMode]=useState(false);
  const drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
  const active=bookings.filter(b=>config.reserveStatuses.includes(b.status)&&overlaps(reservation(request),reservation(b)));
  const dirtyBooking=active.find(b=>b.type==='dirty');
  const zone=config.zones.find(z=>z.id===inspected),zoneBooking=active.find(b=>b.zones.includes(inspected!));
  const highlighted=bookings.find(b=>b.id===highlight);
  const groupIds=highlighted?.zones??selected.zones,groupType=highlighted?.type??request.type;
  const groupBounds=storageSelected?null:zoneBounds(groupIds,config,groupType);
  const groupDimensions=storageSelected?null:dimensions(groupIds,config,groupType);
  const inspectedDimensions=zone?dimensions([zone.id],config):null;
  const bookedDimensions=zoneBooking?dimensions(zoneBooking.zones,config,zoneBooking.type):null;
  const reset=()=>{setZoom(1);setPan({x:0,y:0});};
  const formatLength=(value:number)=>`${Number(value.toFixed(1))} m`;
  return <div className="plan-wrap">
    <div className="plan-toolbar"><div className="eyebrow"><span className="tiny-square"/>FIRST FLOOR<span className="muted">/</span>COMMUNITY STUDIO</div><div className="plan-tools"><button aria-label="Toggle pan" title="Pan drawing" className={panMode?'active':''} onClick={()=>setPanMode(!panMode)}><Hand size={15}/></button><span/><button aria-label="Zoom out" onClick={()=>setZoom(v=>Math.max(.7,v-.2))}><Minus size={16}/></button><small>{Math.round(zoom*100)}%</small><button aria-label="Zoom in" onClick={()=>setZoom(v=>Math.min(3,v+.2))}><Plus size={16}/></button><button aria-label="Reset drawing view" onClick={reset}><Maximize2 size={15}/></button></div></div>
    <div className={`plan-canvas ${panMode?'panning':''}`}>
      <div className="north-marker">N<span>↑</span></div>
      <svg className="floor-svg" viewBox="70 325 1250 535" aria-label="Interactive Community Studio floor plan, zones 1 to 10, fixed dirty workshop and storage" onPointerDown={e=>{if(panMode){drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};e.currentTarget.setPointerCapture(e.pointerId);}}} onPointerMove={e=>{if(drag.current){const ratio=1250/e.currentTarget.getBoundingClientRect().width;setPan({x:drag.current.px+(e.clientX-drag.current.x)*ratio,y:drag.current.py+(e.clientY-drag.current.y)*ratio});}}} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
        <defs><pattern id="unavailable" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M-2 2L2 -2M0 10L10 0M8 12L12 8" stroke="#b0b0ae" strokeWidth="1.8"/></pattern><pattern id="dirty-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 9L9 0" stroke="#b6b6b3" strokeWidth=".6"/></pattern></defs>
        <g transform={`translate(${695+pan.x} ${590+pan.y}) scale(${zoom}) translate(-695 -590)`}>
          <image href="/architectural-plan.svg" x="0" y="0" width="1600" height="1131" opacity=".65"/>
          <path d="M974 401H1075V497H1229V716L1271 724V773H974Z" fill={dirtyBooking||highlighted?.type==='dirty'?'#d8e2ec':request.type==='dirty'&&!storageSelected?'#f5d1cb':'#e4e4e2'} fillOpacity=".8" stroke={request.type==='dirty'&&!storageSelected?'#b3453c':'#a8a8a5'} strokeWidth={request.type==='dirty'&&!storageSelected?'3':'1.5'}/>
          <path d="M974 401H1075V497H1229V716L1271 724V773H974Z" fill="url(#dirty-hatch)"/>
          {config.zones.map(z=>{
            const booking=active.find(b=>b.zones.includes(z.id));
            const proposed=selected.zones.includes(z.id)&&request.type!=='dirty'&&!storageSelected;
            const lit=highlighted?.zones.includes(z.id);
            const state=z.unavailable?'unavailable':booking?'booked':proposed?'proposed':'available';
            const [cx,cy]=[378+(z.id-1)%5*118+59,z.id<=5?505:703];
            return <g key={z.id} className={`zone ${state} ${lit?'highlighted':''}`}>
              <polygon points={z.points} fill={z.unavailable?'url(#unavailable)':undefined} tabIndex={panMode?-1:0} role="button" aria-label={`Zone ${z.id}, ${(z.sqft*.09290304).toFixed(0)} square metres, ${booking?`reserved by ${booking.name}`:proposed?'proposed':state}`} aria-pressed={proposed} onClick={()=>{if(!panMode)onZone(z.id);}} onKeyDown={e=>{if(!panMode&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onZone(z.id);}}}/>
              <g className="zone-label" pointerEvents="none"><text x={cx} y={cy-9} className="zone-number">{String(z.id).padStart(2,'0')}</text><text x={cx} y={cy+16} className="zone-area">{(z.sqft*.09290304).toFixed(0)} m²</text>{booking&&<text x={cx} y={cy+38} className="zone-state">RESERVED</text>}{proposed&&!booking&&<text x={cx} y={cy+38} className="zone-state">PROPOSED</text>}</g>
            </g>;
          })}
          {config.routes.map((d,i)=><path key={i} d={d} stroke="#527c79" strokeWidth="4" strokeDasharray="8 7" fill="none" opacity=".65" pointerEvents="none"/>)}
          {config.obstructions.map((o,i)=><rect key={i} {...o} fill="#5f5f5c" stroke="white" strokeWidth="2" pointerEvents="none"/>)}
          <g className="dirty-label" pointerEvents="none"><text x="1110" y="607" className="fixed-tag">FIXED WORKSHOP</text><text x="1110" y="637" className="dirty-title">Dirty workshop</text><text x="1110" y="662">84 m² · separate from zones</text><text x="1110" y="685" className="small-svg">{dirtyBooking?`${dirtyBooking.name.slice(0,24)} · ${dirtyBooking.participants+dirtyBooking.staff+dirtyBooking.visitors} people`:'Fixed provision'}</text></g>
          <g className={`storage-space ${storageSelected?'selected':''}`}>
            <polygon points="1080,381 1230,381 1230,493 1080,493" role="button" tabIndex={panMode?-1:0} aria-label="Request storage on floor plan" aria-pressed={storageSelected} fill={storageSelected?'#f5d1cb':'#e9e9e7'} fillOpacity=".9" stroke={storageSelected?'#b3453c':'#777775'} strokeWidth={storageSelected?'3':'1.5'} onClick={()=>{if(!panMode)onStorage();}} onKeyDown={e=>{if(!panMode&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onStorage();}}}/>
            <text x="1155" y="434" textAnchor="middle" fontSize="18" fontWeight="600" fill="#30302e" pointerEvents="none">Storage</text>
            <text x="1155" y="460" textAnchor="middle" fontSize="10" fill="#666662" pointerEvents="none">REQUEST ONLY</text>
          </g>
          <text x="271" y="720" textAnchor="middle" className="small-svg muted-svg">Unallocated</text><text x="271" y="741" textAnchor="middle" className="small-svg muted-svg">not bookable</text>
          {[[372,379],[348,651],[1232,509]].map(([x,y],i)=><g key={i} transform={`translate(${x},${y})`} role="img" aria-label={`Indicated exit ${i+1}, route requires verification`}><rect x="-13" y="-13" width="26" height="26" rx="2" fill="#303b39"/><path d="M8 0H-8M-3-5L-8 0l5 5" stroke="white" strokeWidth="2" fill="none"/></g>)}
          {groupBounds&&groupDimensions&&<g className="plan-dimensions" pointerEvents="none" role="img" aria-label={`${highlighted?'Booked':'Selected'} group overall bounds: ${groupDimensions.label}`}>
            <title>Approximate overall bounds, including recesses and obstructions</title>
            <path d={`M${groupBounds.x} ${groupBounds.y-15}V${groupBounds.y-31}M${groupBounds.x} ${groupBounds.y-23}H${groupBounds.x+groupBounds.width}M${groupBounds.x+groupBounds.width} ${groupBounds.y-15}V${groupBounds.y-31}`} fill="none" stroke="#383835" strokeWidth="1.7"/>
            <text x={groupBounds.x+groupBounds.width/2} y={groupBounds.y-33} textAnchor="middle" fontSize="14" fill="#383835">≈ {formatLength(groupDimensions.width)}</text>
            <path d={`M${groupBounds.x+groupBounds.width+15} ${groupBounds.y}H${groupBounds.x+groupBounds.width+31}M${groupBounds.x+groupBounds.width+23} ${groupBounds.y}V${groupBounds.y+groupBounds.height}M${groupBounds.x+groupBounds.width+15} ${groupBounds.y+groupBounds.height}H${groupBounds.x+groupBounds.width+31}`} fill="none" stroke="#383835" strokeWidth="1.7"/>
            <text transform={`translate(${groupBounds.x+groupBounds.width+42},${groupBounds.y+groupBounds.height/2}) rotate(90)`} textAnchor="middle" fontSize="14" fill="#383835">≈ {formatLength(groupDimensions.depth)}</text>
          </g>}
          <path d="M440 818H558M440 813v10M499 813v10M558 813v10" stroke="#777773" strokeWidth="1.5"/><text x="574" y="823" className="small-svg muted-svg">{config.scaleMetersPerUnit?formatLength(118*config.scaleMetersPerUnit):'Scale uncalibrated'}</text>
        </g>
      </svg>
      <span className="plan-caption">A101 · Floor plan<span>Provisional areas</span></span>
      {zone&&<div className="zone-popover"><button className="icon-button popover-close" aria-label="Close zone details" onClick={()=>onInspect(null)}>×</button><div className="eyebrow">ZONE {String(zone.id).padStart(2,'0')}</div><strong>{(zone.sqft*.09290304).toFixed(0)} m² <small> / {zone.sqft.toFixed(0)} sq ft</small></strong><p>{zone.areaVerified?'Verified area':'Provisional area'}</p><p>{inspectedDimensions?.label??'Dimensions need calibration'}{inspectedDimensions&&' · overall bounds'}</p><div className="detail-line">{zoneBooking?<><span className="dot amber"/>{zoneBooking.name}</>:zone.unavailable?'Unavailable':<><span className="dot green"/>Available for this interval</>}</div>{zoneBooking&&<p>Booked group: {bookedDimensions?.label??'dimensions need calibration'}{bookedDimensions&&' · overall bounds'}</p>}</div>}
    </div>
    <div className="plan-bottom"><div className="legend"><span><i className="legend-available"/>Available</span><span><i className="legend-proposed"/>Proposed</span><span><i className="legend-booked"/>Reserved</span><span><i className="legend-unavailable"/>Unavailable</span></div><span className="route-key"><i/>Protected route</span></div>
    <div className="plan-footnote"><Info size={14}/><span>Select connected zones. Routes indicative; keep clear. <span className="muted">{groupDimensions?'Dimensions show overall bounds.':'Dimensions need calibration.'}</span></span><button onClick={reset} aria-label="Reset map zoom and pan"><RotateCcw size={12}/></button></div>
  </div>;
}
