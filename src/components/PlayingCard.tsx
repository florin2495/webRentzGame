import { isRed, RANK_LABEL, rankOf, SUIT_SYMBOL, suitOf, type Card } from "@/lib/game";

interface Props {
  card: Card;
  size?: "sm" | "md" | "lg";
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
  sm: "w-8 text-[11px] rounded",
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
        red ? "text-rose-600" : "text-zinc-900"
      } ${selected ? "-translate-y-2 border-indigo-500 ring-2 ring-indigo-500" : playable ? "border-indigo-400" : "border-zinc-300"} ${
        dimmed ? "opacity-40" : ""
      } ${faded ? "opacity-60" : ""} transition-transform`}
    >
      <span className="self-start">{RANK_LABEL[rankOf(card)]}</span>
      <span className={`self-center ${size === "sm" ? "text-sm" : "text-xl sm:text-2xl"}`}>{SUIT_SYMBOL[suitOf(card)]}</span>
      <span className="self-end rotate-180">{RANK_LABEL[rankOf(card)]}</span>
    </span>
  );
  if (!onClick) {
    return (
      <span className="flex flex-col items-center gap-0.5" aria-label={text}>
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
      aria-label={`${text}${playable ? "" : " (nu se poate juca acum)"}`}
      className="flex justify-center disabled:cursor-default"
    >
      {body}
    </button>
  );
}
