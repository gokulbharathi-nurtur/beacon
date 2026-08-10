import { cn } from "@/lib/utils";

// Ring with a solid/hollow dot pair — a live dataLayer capture checked against
// a saved template. Kept in sync with app/icon.svg (favicon) and app/apple-icon.png.
export function BeaconMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center bg-primary text-primary-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
        <path
          d="M14.12 4.08 A8.2 8.2 0 0 1 19.92 14.12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M17.8 17.8 A8.2 8.2 0 0 1 6.2 17.8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M4.08 14.12 A8.2 8.2 0 0 1 9.88 4.08"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="9" cy="12" r="2.3" fill="currentColor" />
        <circle cx="15" cy="12" r="2.3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </span>
  );
}
