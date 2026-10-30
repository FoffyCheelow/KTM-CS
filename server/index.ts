import express from 'express';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, BookingError } from './store.ts';
import { bookingSchema, configSchema, proposalSchema, statusSchema, storageCreateSchema } from './schema.ts';
import { evaluate, propose } from '../shared/engine.ts';
import { z } from 'zod';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=process.env.STUDIO_DATA_DIR || path.join(root,'.data'); mkdirSync(dataDir,{recursive:true,mode:0o700});
const store=new Store(path.join(dataDir,'studio.sqlite'),process.env.STUDIO_SEED !== 'false');
const passwordFile=path.join(dataDir,'manager-password');
if(!process.env.STUDIO_MANAGER_PASSWORD && !existsSync(passwordFile)) writeFileSync(passwordFile,randomBytes(18).toString('base64url'),{mode:0o600});
const password=process.env.STUDIO_MANAGER_PASSWORD || readFileSync(passwordFile,'utf8').trim();
const salt=randomBytes(16), passwordHash=scryptSync(password,salt,32);
const sessions=new Map<string,number>(), attempts=new Map<string,{count:number,until:number}>();
const app=express(); app.disable('x-powered-by'); app.use(express.json({limit:'128kb'}));
app.use((req,res,next)=> {
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
  if(req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      if(!req.is('application/json')) return res.status(415).json({error:'Send JSON content.'});
      if(req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({error:'Cross-origin changes are not allowed.'});
    }
  }
  next();
});
const token=(req:express.Request)=>req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('studio_session='))?.slice(15) || '';
const isManager=(req:express.Request)=> (sessions.get(token(req)) || 0)>Date.now();
const manager:express.RequestHandler=(req,res,next)=>isManager(req)?next():res.status(403).json({error:'Sign in as a manager to perform this action.'});
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.get('/api/state',(req,res)=>res.json({config:store.config(),bookings:store.bookings(),storageRequests:store.storageRequests(),manager:isManager(req)}));
app.post('/api/login',(req,res)=> {
  const key=req.ip || 'local', current=attempts.get(key);
  if(current && current.until>Date.now() && current.count>=5) return res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});
  const candidate=z.object({password:z.string().max(500)}).parse(req.body).password;
  if(!timingSafeEqual(passwordHash,scryptSync(candidate,salt,32))) {
    attempts.set(key,{count: current && current.until>Date.now()?current.count+1:1,until:Date.now()+900000}); return res.status(401).json({error:'The manager password is incorrect.'});
  }
  attempts.delete(key);const session=randomBytes(32).toString('hex');sessions.set(session,Date.now()+8*3600000);
  res.cookie('studio_session',session,{httpOnly:true,sameSite:'strict',secure:req.secure,maxAge:8*3600000});res.json({manager:true});
});
app.post('/api/logout',(req,res)=>{sessions.delete(token(req));res.clearCookie('studio_session');res.json({ok:true});});
app.post('/api/propose',(req,res)=>{const {request,zones}=proposalSchema.parse(req.body);const config=store.config(),bookings=store.bookings();const proposal=propose(request,bookings,config);if(zones!==undefined) proposal.selected=evaluate(request,zones,bookings,config);res.json(proposal);});
app.post('/api/bookings',(req,res)=> {const {request,zones,status}=bookingSchema.parse(req.body);res.status(201).json(store.create(request,zones,status,isManager(req)));});
app.post('/api/bookings/:id/status',manager,(req,res)=>res.json(store.changeStatus(String(req.params.id),statusSchema.parse(req.body.status))));
app.post('/api/storage',(req,res)=>{const {status,...request}=storageCreateSchema.parse(req.body);res.status(201).json(store.createStorage(request,status,isManager(req)));});
app.post('/api/storage/:id/status',manager,(req,res)=>res.json(store.changeStorageStatus(String(req.params.id),statusSchema.parse(req.body.status))));
app.put('/api/config',manager,(req,res)=>res.json(store.updateConfig(configSchema.parse(req.body))));
app.get('/api/audit',manager,(_req,res)=>res.json(store.audit()));
app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found.'}));
if(process.env.NODE_ENV==='production') {
  app.use(express.static(path.join(root,'dist'))); app.get('/{*path}',(_req,res)=>res.sendFile(path.join(root,'dist/index.html')));
} else {
  const {createServer}=await import('vite');const vite=await createServer({root,server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
}
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=> {
  if(err instanceof z.ZodError) return res.status(400).json({error:err.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')});
  if(err instanceof BookingError) return res.status(err.code).json({error:err.message,details:err.details});
  console.error(err);res.status(500).json({error:'The request could not be completed.'});
});
const port=Number(process.env.PORT || 3000);app.listen(port,'0.0.0.0',(error?:Error)=>{
  if(error){console.error(`Could not start Community Studio on port ${port}: ${error.message}`);process.exit(1);}
  console.log(`Community Studio Space Planner listening on port ${port}. Manager password is stored in ${passwordFile} (or STUDIO_MANAGER_PASSWORD).`);
});
