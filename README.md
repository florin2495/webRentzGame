# webRentzGame

Rentz multiplayer, jocul clasic de cărți, în 3 sau 4 prieteni, pe telefon.
Next.js 16 (App Router), Supabase (Postgres + Realtime Broadcast), deploy pe Vercel (fra1). Domeniu: https://rentz.hailatat.icu

## Reguli

- 3 sau 4 jucători, câte 8 cărți: în 3 se joacă cu 9–A (24 cărți), în 4 cu 7–A (32 cărți).
- La fiecare mână alege jocul alt jucător, prin rotație. Fiecare alege fiecare din cele 7 jocuri o dată, deci un meci are 21 sau 28 de mâini.
- Cine alege, pune prima carte. Se răspunde obligatoriu la culoare, nu există atu, iar levata o ia cartea cea mai mare din culoarea cerută.
- **Refuz:** o singură dată pe meci, fiecare jucător poate refuza cărțile, fără motiv, cât timp nu s-a pus încă nicio carte. Se împart din nou, iar același jucător alege din nou jocul.

| Joc | Punctaj |
| --- | --- |
| Regele de inimă | −100 cui ia K♥ (mâna se oprește când iese) |
| Dame | −30 pe damă (se oprește după a 4-a) |
| Carouri | −20 pe caro (se oprește după ultimul) |
| Levate | −20 pe levată |
| Whist | +50 pe levată |
| Totale | toate penalizările de mai sus la un loc |
| Rentz | cărțile se pun pe culori, crescător, de la cartea aleasă de jucătorul care alege (după As urmează cea mai mică). Cine nu poate pune, dă pas. Locurile primesc 400/300/200/100 (în 3 jucători 300/200/100) |

Extra: host-ul poate „juca în locul” unui jucător care nu mai răspunde (mutare permisă, aleasă la întâmplare).
Dacă un jucător pleacă în timpul meciului, meciul se oprește și rămâne scorul de atunci.
Camerele din lobby sau terminate se închid după 2 minute în care nu le are nimeni deschise. Meciurile pe care nu le mai are nimeni deschise se închid după 30 de minute.

## Arhitectură

- Regulile sunt funcții pure în `src/lib/game.ts`. Tot meciul, inclusiv mâinile, stă într-o coloană `jsonb` (`rentz_rooms.match`).
  Fiecare mutare se salvează condiționat de `version`, deci două mutări simultane nu pot trece amândouă.
- Route Handlers cu service role key. Tabelele au RLS fără policy, iar browserul nu le poate citi.
  `/state` trimite fiecăruia doar mâna lui.
- Live: Supabase Realtime Broadcast pe `room:<uuid>` (doar semnal), apoi refetch la `/state`. Polling la 15 s, ca rezervă.

## Setup

1. Supabase (proiectul comun): SQL Editor → rulează `supabase/schema.sql`. Toate tabelele au prefixul `rentz_`.
2. Local: `npm install`, `.env.local` după `.env.example`, `npm run dev`, `npm test`.
3. Vercel: Import `florin2495/webRentzGame` și adaugi cele 3 variabile din `.env.example`. Regiunea e deja `fra1` în `vercel.json`.
   Domeniu: Settings → Domains → `rentz.hailatat.icu` (CNAME la registrar).
