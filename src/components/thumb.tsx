/**
 * YouTube cover thumbnail, loaded directly from YouTube (plain <img>, as on main; no
 * next/image optimiser). Sizing comes from the existing CSS
 * (`.x img { width: 100%; height: 100%; object-fit: cover }`). Decorative: alt="".
 * Off-screen thumbnails (queue, archive) load lazily; the turntable cover is eager.
 */
export function Thumb({ src, eager = false }: { src: string; eager?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />;
}
