import { GAME_INFO, GAMES } from "@/lib/game";

/** Collapsible rules, shown on the landing page and in the lobby. */
export function Rules({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="text-sm text-zinc-600 dark:text-zinc-400">
      <summary className="cursor-pointer font-semibold">Reguli</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>3 sau 4 jucători, câte 8 cărți fiecare (în 3 se joacă de la 9 în sus, în 4 de la 7 în sus).</li>
        <li>
          La fiecare mână, un jucător se uită în cărți și <b>alege jocul</b>. Fiecare alege fiecare joc o singură dată, deci
          un meci are 7 mâini × numărul de jucători.
        </li>
        <li>Cine alege, pune prima carte. Se răspunde obligatoriu la culoare; dacă nu ai, dai orice. Nu există atu.</li>
        <li>Levata o ia cartea cea mai mare din culoarea cerută. Cine ia levata, pune următoarea carte.</li>
        <li>
          <b>Refuz:</b> o singură dată pe meci, fiecare jucător poate refuza cărțile, fără motiv, cât timp nu s-a pus nicio
          carte pe masă. Se împart din nou, iar jocul se alege din nou.
        </li>
      </ol>
      <ul className="mt-3 space-y-1">
        {GAMES.map((g) => (
          <li key={g}>
            <b>{GAME_INFO[g].name}:</b> {GAME_INFO[g].rule}
          </li>
        ))}
        <li className="text-xs">Rentz: în 4 jucători 400 / 300 / 200 / 100, în 3 jucători 300 / 200 / 100.</li>
      </ul>
    </details>
  );
}
