export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin text-muted" aria-label="Загрузка">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function FullScreenLoader({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-screen items-center justify-center gap-3 text-sm text-muted">
      <Spinner /> {label}
    </div>
  );
}
