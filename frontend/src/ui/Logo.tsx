import { Link } from "react-router-dom";
import { cn } from "../lib/format";

export default function Logo({ light, className, to = "/" }: { light?: boolean; className?: string; to?: string }) {
  return (
    <Link to={to} className={cn("group inline-flex min-w-0 items-center gap-2.5", className)} aria-label="Braids by Chii_e, home">
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full border font-display text-lg italic transition group-hover:rotate-[-8deg]",
          light ? "border-gold/60 text-gold" : "border-gold text-gold-deep",
        )}
        aria-hidden
      >
        C
      </span>
      <span className={cn("font-display text-[1.15rem] leading-none tracking-tight whitespace-nowrap sm:text-[1.35rem] lg:text-[1.5rem]", light ? "text-ivory" : "text-ink")}>
        Braids <span className="italic text-gold">by</span> Chii_e
      </span>
    </Link>
  );
}

export function SocialIcon({ name, className }: { name: "instagram" | "whatsapp"; className?: string }) {
  const paths = {
    instagram: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" />
      </>
    ),
    whatsapp: (
      <path
        d="M12 3.6a8.2 8.2 0 0 0-7.1 12.3L3.6 20.4l4.6-1.2A8.2 8.2 0 1 0 12 3.6zm0 1.6a6.6 6.6 0 0 1 5.6 10.1l-.2.4.7 2.6-2.7-.7-.4.2A6.6 6.6 0 1 1 12 5.2z"
        fill="currentColor"
      />
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} aria-hidden>
      {paths[name]}
    </svg>
  );
}
