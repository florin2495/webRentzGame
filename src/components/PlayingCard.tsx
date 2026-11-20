import { isRed, RANK_LABEL, rankOf, SUIT_SYMBOL, suitOf, type Card } from "@/lib/game";

interface Props {
  card: Card;
  size?: "xs" | "sm" | "felt" | "md" | "lg";
  onClick?: () => void;
  /** Can be played now (hand only). */
  playable?: boolean;
  /** Greyed out: not playable now (hand only). */
  dimmed?: boolean;
  selected?: boolean;
  faded?: boolean;
  label?: string;
}

const SIZES = {
  xs: "w-7 text-[10px] rounded-md",
  sm: "w-8 text-[11px] rounded",
  felt: "w-10 text-xs rounded-md sm:w-11 sm:text-sm",
  md: "w-full max-w-14 text-sm rounded-md",
  lg: "w-14 text-base rounded-lg sm:w-16",
};

/** A face-up card drawn with plain HTML: rank in the corner, big suit in the middle. */
export function PlayingCard({ card, size = "md", onClick, playable, dimmed, selected, faded, label }: Props) {
  const red = isRed(card);
  const text = `${RANK_LABEL[rankOf(card)]}${SUIT_SYMBOL[suitOf(card)]}`;
  const body = (
    <span
      className={`relative flex aspect-[5/7] flex-col justify-between border bg-white p-0.5 font-bold leading-none shadow-sm dark:bg-zinc-100 ${SIZES[size]} ${
        playable ? "hover:-translate-y-1" : ""
      } ${
        red ? "text-rose-600" : "text-zinc-900"
      } ${selected ? "-translate-y-2 border-indigo-500 ring-2 ring-indigo-500" : playable ? "border-indigo-400" : "border-zinc-300"} ${
        dimmed ? "opacity-40" : ""
      } ${faded ? "opacity-60" : ""} transition-transform`}
    >
      <span className="relative z-10 self-start text-left">
        {RANK_LABEL[rankOf(card)]}
        <span className="block text-[0.8em]">{SUIT_SYMBOL[suitOf(card)]}</span>
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center opacity-90 ${
          size === "xs" || size === "sm" ? "text-base" : size === "felt" ? "text-xl" : "text-2xl sm:text-3xl"
        }`}
      >
        {SUIT_SYMBOL[suitOf(card)]}
      </span>
      <span className="relative z-10 self-end rotate-180">{RANK_LABEL[rankOf(card)]}</span>
    </span>
  );
  if (!onClick) {
    return (
      <span className="flex flex-col items-center gap-0.5" aria-label={text} data-card={card}>
        {body}
        {label && <span className="max-w-16 truncate text-[10px] font-semibold text-zinc-500">{label}</span>}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!playable}
      data-card={card}
      aria-label={`${text}${playable ? "" : " (nu se poate juca acum)"}`}
      className="flex justify-center disabled:cursor-default"
    >
      {body}
    </button>
  );
}
