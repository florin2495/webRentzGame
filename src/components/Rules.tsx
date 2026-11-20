import { GAME_INFO, GAMES } from "@/lib/game";

/** Collapsible rules, shown on the landing page and in the lobby. */
export function Rules({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="text-sm text-zinc-600 dark:text-zinc-400">
      <summary className="cursor-pointer font-semibold">Reguli</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          3 până la 6 jucători, câte 8 cărți fiecare. Se joacă doar cu cărțile mari, ca să iasă împărțirea exactă: în 3 de la 9 în sus,
          în 4 de la 7, în 5 de la 5, în 6 de la 3 în sus.
        </li>
        <li>
          La fiecare mână, un jucător se uită în cărți și <b>alege jocul</b>. Fiecare alege fiecare joc o singură dată, deci
          un meci are 8 mâini × numărul de jucători (9 dacă la crearea camerei se adaugă Totale +).
        </li>
        <li>Cine alege, pune prima carte. Se răspunde obligatoriu la culoare; dacă nu ai, dai orice. Nu există atu.</li>
        <li>Levata o ia cartea cea mai mare din culoarea cerută. Cine ia levata, pune următoarea carte.</li>
        <li>
          <b>Refuz:</b> o singură dată pe meci, fiecare jucător poate refuza cărțile, fără motiv, cât timp nu s-a pus nicio
          carte pe masă. Se împart din nou, iar jocul se alege din nou.
        </li>
        <li>
          <b>Blind:</b> fiecare jucător are un singur joc blind pe meci. Când îi vine rândul să aleagă, e întrebat întâi dacă joacă
          blind, înainte să-și vadă cărțile; dacă da, alege jocul fără să le vadă și punctajul mâinii se dublează. Dacă mâna se
          reîmparte (refuz sau Rentz anulat), blind-ul nu se consumă și este întrebat din nou.
        </li>
        <li>
          <b>Anulare Rentz:</b> capetele sunt cea mai mică carte din joc și Asul (în 4 jucători: 7 și A). Dacă s-a ales Rentz și ai
          cel puțin 4 capete în mână (și cel care a ales), poți anula Rentz-ul înainte de prima carte: se împart din nou și
          același jucător alege din nou. Nu are limită și nu consumă refuzul.
        </li>
      </ol>
      <ul className="mt-3 space-y-1">
        {GAMES.map((g) => (
          <li key={g}>
            <b>{GAME_INFO[g].name}:</b> {GAME_INFO[g].rule}
          </li>
        ))}
        <li className="text-xs">Totale + e opțional: se alege la crearea camerei.</li>
      </ul>
    </details>
  );
}
