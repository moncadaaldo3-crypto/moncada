(()=>{
const nav=document.querySelector('nav'),button=document.createElement('button');button.textContent='Carica documenti';button.onclick=()=>location.href='/inserimento.html';nav.append(button);
const backup=document.createElement('a');backup.className='link';backup.href='/api/database';backup.textContent='Esporta database JSON';nav.append(backup);
const logout=document.createElement('form');logout.method='post';logout.action='/logout';logout.innerHTML='<button>Esci</button>';nav.append(logout);
fetch('/api/records').then(r=>r.json()).then(rows=>{const root=document.getElementById('invoice-content');for(const item of rows.filter(r=>r.type==='invoice')){const r=item.record,box=document.createElement('article');box.className='panel';box.style.marginTop='16px';const h=document.createElement('h2');h.textContent=r.supplier+' · '+r.invoiceNumber;const p=document.createElement('p');p.textContent=r.date+' · '+r.group+' · '+new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(r.amountCents/100);const a=document.createElement('a');a.href=r.source;a.textContent='Apri allegato';a.target='_blank';a.rel='noopener';box.append(h,p,a);root.append(box);}}).catch(()=>{});
})();
