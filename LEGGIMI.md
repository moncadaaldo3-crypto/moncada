# 428 · Prova su Netlify

Password di accesso: **aldo4**. L'indirizzo è raggiungibile da tutti; contenuti, JSON e allegati richiedono la password. Chi conosce la password può leggere e inserire dati.

## Pubblicazione

Questo progetto contiene funzioni server: NON trascinare lo ZIP nella pubblicazione statica Netlify Drop e NON pubblicare la cartella private-site.

Metodo consigliato: estrai lo ZIP in un repository Git privato e importa il repository in Netlify. La configurazione è già in netlify.toml: build `npm run build`, cartella pubblica `public`, funzioni `netlify/functions`. Netlify installerà le dipendenze.

Oppure con Node.js 22 o superiore, dal terminale nella cartella estratta:

```
npm install
npx netlify-cli login
npx netlify-cli deploy --build --prod
```

Scegli o crea il progetto Netlify quando richiesto. Non è stato pubblicato né testato nel tuo account Netlify: verifica lì accesso e primo salvataggio. Il funzionamento richiede che Netlify Functions e Blobs siano disponibili nel tuo account.

## Uso

Accedi con la password, scegli Carica documenti, compila i campi e allega JPG/PNG/PDF fino a 3 MB. La data delle chiusure è quella di inizio turno. Inserisci solo POS, non POS cassa. Asporto resta separato. Per gli acquisti inserisci il totale IVA inclusa. La foto non viene letta automaticamente.

La password viene verificata sul server. Non è inserita nel codice inviato al browser. I file server-config.json e database.json devono restare fuori dalla cartella pubblica. Per cambiare password, rigenera server-config.json con uno script equivalente a quello usato nel progetto; per la prova usa la password concordata. Mantieni segreto questo ZIP.

## Dove vengono salvati i dati

`database.json` è l'archivio iniziale incluso nello ZIP, con i dati del locale fino alla fornitura Partesa del 6 ottobre. I nuovi documenti vengono salvati come record JSON nello store persistente Netlify Blobs `accounting-428-json`, insieme agli allegati codificati base64. Sono condivisi tra dispositivi e sopravvivono alle nuove pubblicazioni nello stesso progetto Netlify. Lo ZIP originale non viene riscritto.

Il pulsante Esporta database JSON scarica un backup con tutti i dati contabili e gli allegati nuovi. Gli allegati storici sono nella cartella private-site del pacchetto: conserva anche lo ZIP. Il backup è esportabile, non è presente una funzione di ripristino/importazione dall'interfaccia.

Controlli duplicati: una chiusura per data; per le nuove fatture fornitore + numero + anno. Non reinserire la fattura di un DDT già contabilizzato. Dal pulsante Modifica / elimina puoi correggere o eliminare documenti storici e nuovi. La cancellazione richiede conferma ed esclude la voce dai totali; gli originali e gli allegati vengono conservati. Le modifiche persistono nello store Netlify Blobs e sono incluse nel backup JSON. Il controllo di revisione impedisce di sovrascrivere modifiche concorrenti: in caso di conflitto ricarica la pagina.

Il sito ChatGPT e questa copia Netlify NON si sincronizzano. Supabase non è ancora configurato; l'archivio JSON esportabile permette una successiva migrazione.

## Verifiche

`npm test` verifica con un archivio simulato: accesso negato senza password, login, salvataggio di fattura e chiusura, duplicati, persistenza tra richieste, aggiornamento dei totali e protezione allegati. Non sostituisce una prova dopo la pubblicazione Netlify.
