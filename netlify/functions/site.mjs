import {getStore} from '@netlify/blobs';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {createHmac,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
const root=resolve('private-site');
const settings=JSON.parse(await readFile(resolve('server-config.json'),'utf8'));
const seed=JSON.parse(await readFile(resolve('database.json'),'utf8'));
const sig=x=>createHmac('sha256',settings.sessionSecret).update(x).digest('hex');
const equal=(a,b)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const login=`<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>428 · Accesso</title><style>body{font:18px system-ui;background:#f5f6ef;color:#173d36;max-width:420px;margin:15vh auto;padding:24px}input,button{font:inherit;padding:14px;box-sizing:border-box;width:100%;margin:10px 0}button{background:#173d36;color:white;border:0}</style><h1>428 · Controllo del locale</h1><p>Inserisci la password per accedere.</p><form method="post" action="/login"><input type="password" name="password" aria-label="Password" autocomplete="current-password" required><button>Accedi</button></form></html>`;
const response=(body,status=200,type='application/json',extra={})=>new Response(type==='application/json'?JSON.stringify(body):body,{status,headers:{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
export function createHandler(storeFactory=()=>getStore({name:'accounting-428-json',consistency:'strong'})) {return async(req)=>{try{
 const u=new URL(req.url),path=u.pathname;
 if(req.method==='POST'&&req.headers.get('origin')!==u.origin)return response({error:'Origine non valida'},403);
 if(path==='/login'&&req.method==='POST'){
  const p=(await req.formData()).get('password');
  if(typeof p!=='string'||p.length>200||!equal(scryptSync(p,settings.salt,32).toString('hex'),settings.passwordHash))return response(login+'<p>Password errata.</p>',401,'text/html');
  const exp=String(Date.now()+12*3600000);return response('',303,'text/plain',{'Location':'/','Set-Cookie':`session=${exp}.${sig(exp)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`});
 }
 const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8)||'';const [exp,mac]=token.split('.');
 if(!exp||!mac||Number(exp)<Date.now()||!equal(sig(exp),mac))return path.startsWith('/api/')?response({error:'Accesso richiesto'},401):response(login,401,'text/html');
 if(path==='/logout'&&req.method==='POST')return response('',303,'text/plain',{'Location':'/','Set-Cookie':'session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
 const store=storeFactory();
 const entries=async()=>{const {blobs}=await store.list({prefix:'records/'});return (await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})))).filter(Boolean);};
 const effective=async()=>{
  const uploads=await entries();const overlay=await store.getWithMetadata('management/overrides',{type:'json'});
  const all=[...seed.expenses.records.map(record=>({id:record.id,type:'invoice',record,seed:true})),...seed.closings.map(record=>({id:record.id,type:'closing',record,seed:true})),...uploads];
  const changes=overlay?.data||{};
  const rows=all.filter(r=>!changes[r.id]?.deleted).map(r=>{const result={...r,record:changes[r.id]?.record||r.record};result.revision=createHash('sha256').update(JSON.stringify(result.record)).digest('hex');return result;});return {rows,uploads,overlay,changes,all};
 };
 if(path==='/api/manage'&&req.method==='GET'){const {rows}=await effective();return response(rows.map(({attachment,...r})=>r));}
 if(path==='/api/manage'&&req.method==='POST'){
  const raw=await req.text();if(raw.length>20000)return response({error:'Richiesta troppo grande'},413);const d=JSON.parse(raw);
  const state=await effective(),item=state.rows.find(r=>r.id===d.id);
  if(!item)return response({error:'Documento non trovato o già eliminato'},404);
  if(d.revision!==item.revision)return response({error:'Documento modificato da un altro utente. Ricarica prima di riprovare.'},409);
  if(!['edit','delete'].includes(d.action))return response({error:'Azione non valida'},400);
  let record=structuredClone(item.record);
  if(d.action==='edit'){
   if(typeof d.date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(d.date)||d.date<'2026-09-01'||isNaN(Date.parse(d.date))||new Date(d.date).toISOString().slice(0,10)!==d.date)return response({error:'Data non valida'},400);
   const keys=item.type==='closing'?['barTotal','kitchenTotal','takeawayHandwritten','pos','cashAfterOutflow','reportedTotal']:['amountCents'];
   if(keys.some(k=>!Number.isSafeInteger(d[k])||d[k]<0||d[k]>100000000))return response({error:'Importi non validi'},400);
   for(const k of keys)record[k]=d[k];record.date=d.date;
   if(item.type==='closing'){
    if(state.rows.some(r=>r.id!==item.id&&r.type==='closing'&&r.record.date===d.date))return response({error:'Esiste già una chiusura in questa data'},409);
    record.dateLabel=d.date.slice(8)+'/'+d.date.slice(5,7);record.registeredTotal=d.barTotal+d.kitchenTotal;record.netCollection=d.reportedTotal;
   }else{
    if(typeof d.supplier!=='string'||!d.supplier.trim()||d.supplier.length>150||typeof d.number!=='string'||d.number.length>80||!['Bar','Cucina','Varie','Da chiarire'].includes(d.group))return response({error:'Fornitore, numero o reparto non valido'},400);
    if(d.number.trim()&&state.rows.some(r=>r.id!==item.id&&r.type==='invoice'&&(r.record.supplier||r.record.name).toLowerCase()===d.supplier.trim().toLowerCase()&&String(r.record.invoiceNumber||r.record.documentNumber||'').toLowerCase()===d.number.trim().toLowerCase()&&r.record.date.slice(0,4)===d.date.slice(0,4)))return response({error:'Numero documento già presente per questo fornitore'},409);
    record.name=d.supplier.trim();record.supplier=d.supplier.trim();record.invoiceNumber=d.number.trim();if(record.documentNumber)record.documentNumber=d.number.trim();record.group=d.group;
   }
   record.editedAt=new Date().toISOString();
  }
  state.changes[d.id]={record,deleted:d.action==='delete',updatedAt:new Date().toISOString()};
  const result=await store.setJSON('management/overrides',state.changes,state.overlay?{onlyIfMatch:state.overlay.etag}:{onlyIfNew:true});
  return result.modified?response({ok:true}):response({error:'Archivio aggiornato nel frattempo. Ricarica e riprova.'},409);
 }

 if(path==='/api/records'&&req.method==='POST'){
  if(Number(req.headers.get('content-length')||0)>4500000)return response({error:'File troppo grande'},413);
  const raw=await req.text();if(raw.length>4500000)return response({error:'File troppo grande'},413);const d=JSON.parse(raw);
  if(!['invoice','closing'].includes(d.type)||!/^20\d{2}-\d{2}-\d{2}$/.test(d.date)||d.date<'2026-09-01'||isNaN(Date.parse(d.date))||new Date(d.date).toISOString().slice(0,10)!==d.date) return response({error:'Data o tipo non valido'},400);
  const cents=k=>{if(!Number.isSafeInteger(d[k])||d[k]<0||d[k]>100000000)throw Error('Importo non valido');return d[k]};
  if(d.type==='invoice'&&(!d.supplier?.trim()||!d.number?.trim()||!['Bar','Cucina','Varie'].includes(d.group)))return response({error:'Compila fornitore, numero e reparto'},400);
  if((d.supplier||'').length>150||(d.number||'').length>80)return response({error:'Testo troppo lungo'},400);
  const a=d.attachment;if(!a||!['image/jpeg','image/png','application/pdf'].includes(a.mime)||typeof a.data!=='string'||a.data.length>4200000||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.data))return response({error:'Allega JPG, PNG o PDF fino a 3 MB'},400);
  const bytes=Buffer.from(a.data,'base64');if(bytes.length>3*1024*1024)return response({error:'Massimo 3 MB'},400);
  const valid=a.mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':a.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a';if(!valid)return response({error:'Formato allegato non valido'},400);
  const identity=d.type==='closing'?d.date:d.supplier.trim().toLowerCase()+'|'+d.number.trim().toLowerCase()+'|'+d.date.slice(0,4);
  const id=createHash('sha256').update(d.type+'|'+identity).digest('hex');const source='/api/attachment/'+id;
  const current=await effective();
  if(d.type==='closing'&&current.rows.some(r=>r.type==='closing'&&r.record.date===d.date))return response({error:'Chiusura già presente per questa data'},409);
  if(d.type==='invoice'&&(current.rows.filter(r=>r.type==='invoice').map(r=>r.record).some(r=>(r.supplier||r.name).toLowerCase()===d.supplier.trim().toLowerCase()&&String(r.invoiceNumber||r.documentNumber)===d.number.trim())))return response({error:'Documento già presente'},409);
  let record;if(d.type==='closing'){const bar=cents('bar'),kitchen=cents('kitchen'),pos=cents('pos'),cash=cents('cash'),total=cents('total');record={id,date:d.date,dateLabel:d.date.slice(8)+'/'+d.date.slice(5,7),barTotal:bar,kitchenTotal:kitchen,registeredTotal:bar+kitchen,pos,cashAfterOutflow:cash,reportedTotal:total,netCollection:total,takeawayHandwritten:cents('takeaway'),bar:[],kitchen:[],sources:[source]};}
  else record={id,date:d.date,name:d.supplier.trim(),supplier:d.supplier.trim(),invoiceNumber:d.number.trim(),amountCents:cents('total'),group:d.group,category:'Fattura fornitore',note:'Documento '+d.number.trim(),source,status:'Inserito dal sito',candidateCents:null};
  const result=await store.setJSON('records/'+id,{id,type:d.type,record,attachment:{mime:a.mime,data:a.data},createdAt:new Date().toISOString()},{onlyIfNew:true});
  return result.modified?response({ok:true,id},201):response({error:'Documento già registrato: nessuna duplicazione'},409);
 }
 if(req.method!=='GET')return response({error:'Metodo non consentito'},405);
 if(path.startsWith('/api/attachment/')){const id=path.split('/').pop();if(!/^[a-f0-9]{64}$/.test(id))return response({},404);const row=await store.get('records/'+id,{type:'json'});return row?response(Buffer.from(row.attachment.data,'base64'),200,row.attachment.mime,{'Content-Disposition':'inline; filename="allegato"'}):response({},404);}
 if(['/expenses.json','/closings.json','/invoices.json','/api/database','/api/records'].includes(path)){
  const state=await effective(),rows=state.rows;const db=structuredClone(seed);db.expenses.records=rows.filter(r=>r.type==='invoice').map(r=>r.record);db.closings=rows.filter(r=>r.type==='closing').map(r=>r.record);db.uploads=state.uploads;db.changes=state.changes;
  db.invoices=seed.invoices.flatMap(inv=>{const r=db.expenses.records.find(r=>r.id===inv.expenseId);if(!r)return [];return [{...inv,supplier:r.supplier||r.name,number:r.invoiceNumber||r.documentNumber||inv.number,date:r.date.split('-').reverse().join('/'),total:r.amountCents/100,edited:!!r.editedAt}];});
  if(path==='/invoices.json')return response(db.invoices);
  if(path==='/api/database')return response(db,200,'application/json',{'Content-Disposition':'attachment; filename="database-428.json"'});
  if(path==='/api/records')return response(rows.filter(r=>!r.seed).map(({attachment,...r})=>r));return response(path==='/expenses.json'?db.expenses:db.closings);
 }
 const file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));if(!file.startsWith(root+sep))return response({},404);
 const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.pdf':'application/pdf','.css':'text/css'};
 if(!types[extname(file)])return response({},404);
 try{return response(await readFile(file),200,types[extname(file)]==='application/json'?'application/json; charset=utf-8':types[extname(file)]);}catch{return response({},404);}
 }catch(e){console.error(e.message);return response({error:'Salvataggio non riuscito. Riprova senza chiudere il modulo.'},500);}};}
export default createHandler();
