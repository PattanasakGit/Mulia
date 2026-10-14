export function Avatar({
  name,
  hue,
  emoji,
  size = 28,
}: {
  name: string;
  hue: number;
  emoji: string;
  size?: number;
}) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: `hsl(${hue} 42% 90%)`,
        fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
        fontSize: Math.round(size * (size >= 64 ? 0.56 : 0.74)),
      }}
      title={name}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}
