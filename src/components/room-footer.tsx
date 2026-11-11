export function RoomFooter() {
  return (
    <footer className="room-footer">
      <nav className="room-footer-links" aria-label="ข้อกำหนดและนโยบาย">
        <a href="/terms">Terms</a>
        <span aria-hidden="true">·</span>
        <a href="/privacy">Privacy</a>
        <span aria-hidden="true">·</span>
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
          YouTube ToS
        </a>
      </nav>
      <p className="room-footer-badge" aria-label="Developed with YouTube">
        Developed with YouTube
      </p>
    </footer>
  );
}
