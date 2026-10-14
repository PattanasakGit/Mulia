export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="16" cy="16" r="5.25" fill="currentColor" />
      <circle cx="16" cy="16" r="1.35" fill="var(--page)" />
    </svg>
  );
}
