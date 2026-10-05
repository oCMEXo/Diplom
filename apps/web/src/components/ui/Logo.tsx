import { useId } from "react";

export function LogoMark({ size = 32 }: { size?: number }) {
  // Each mark needs its own gradient id: with a shared one, a mark hidden on small screens takes
  // the gradient with it and the visible marks lose their background.
  const gradient = `logo-g-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b7bff" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
      <path d="M9 9.5 9 21.5 12.2 18.6 14.4 23.4 16.6 22.4 14.4 17.7 18.8 17.5Z" fill="#fff" />
      <path d="M20.5 8.5v6M23.5 11.5h-6" stroke="#fff" strokeOpacity=".85" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">Collab</span>
    </span>
  );
}
