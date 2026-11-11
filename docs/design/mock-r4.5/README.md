# Mulia R4.5: effect parity and full queue panel (design only)
Built on the approved R4.4. The left geometry is identical: every left rect in checks.json matches R4.4 exactly. Repo untouched (8bc2c0f, clean).
Open `html/R45.html?theme=dark|light&state=playing|paused|empty` (with `&n=6` the queue overflows and scrolls).

## Effect parity (live = src/app/globals.css unless noted)
| Effect | Live file:line | Live value | R4.5 |
|---|---|---|---|
| Vinyl spin | 673-677, 3067 | `spin 7s linear infinite`, paused/running via `.is-spinning`; freezes at its current angle | same (was 1.8s in R4.4) |
| Spin trigger | room-stage.tsx:606 | `playing && (audio ? hearing : true)` | playing only |
| Grooves / label | 655-690, 735-765 | repeating-radial grooves, 50% label, 5/6/7px rings, vignette, img scale 1.34, 12px spindle | verbatim |
| Sheen | 663-669 | `.disc::after` 115deg, .16 white | verbatim (rotates with disc) |
| Idle label | vinyl.tsx:574-585, `.monogram` | "M", #ecd09a on brown radial | verbatim (empty state) |
| Glow | 2097-2114 | 620px radial; light rgba(226,196,140,.5); dark rgba(196,148,72,.18), 68%; no blur or pulse | same values; positioned behind the vinyl |
| Wave hills | progress.tsx (hillPath, GILT), 870-905 | 3 seeded hills, crown/body/base gradient, bloom blur 14px sat 1.4 | hillPath ported 1:1, seed = videoId |
| Wave motion | 925-934 | hill-breathe 4.6s / 3.4s -1.2s / 5.8s -2.6s, scaleY .82, only `.is-running` | same; frozen when paused |
| Wave width / swell | 840-850 | width 200ms linear; swell .35+smoothstep·.65, 600ms ease | same |
| Line / knob | 880-920 | white line + 18px hot glow; 20px knob with 3px #fff border and 14px/36px glows (light variants) | verbatim |
| Seek | progress.tsx role=slider, hover scale 1.1 | interactive | **read-only (role=progressbar, no hover)**: the one deviation |
| Play/pause | room-stage.tsx:700-729, 2347-2359 | ink bg, hover scale 1.05, tap .94, spring 420/28, instant icon swap | same (spring approximated with CSS cubic-bezier) |
| Icon buttons | 573-586, 511-517, 970-980 | muted→ink 180ms, active var(--hover) and scale .98 | same |
| Focus | 1427, 2355 | 2px ink outline, offset 3px | same |
| Queue now-dot | 2880-2882 | now-pulse 1.8s | same, playing only |
| Tonearm | none in live (requested) | n/a | 600ms cubic-bezier(.22,1,.36,1) (motion.tsx:6 ease), same frame as spin start/stop |
| Reduced motion | 3174-3189 | all animations and transitions off | same global rule (arm snaps) |
Removed from R4.4: the 1.8s spin, the custom vinyl gradients and shadows, the R44 wave SVG and the arm crossfade.

## Dev requirements
Reuse the live components; do not restyle them:
- `Vinyl` (.turntable .disc .label .monogram .spindle + is-spinning)
- `.deck::before`
- `Progress` (.progress .wave-rest/-art/-bloom/-hill-N/-line/-thumb). Pass a `readOnly` prop that drops pointer handlers and seekable and sets role=progressbar.
- `.play-main` motion.button, `.icon-btn`
- `.queue-card`, `.queue-empty`, `.queue-now`

Only the tonearm is new: drive it from the same `spinning` boolean.

## Queue panel spec
- **Desktop 1440x810:** x 638, top 233 (paste bar bottom 194 + 39), height 496. The bottom (729) equals the play-button bottom, which is the left column's bottom. This is checked.
- **Frame:** the live `.queue-card` surface. Radius 24, 1px border (#3a342c dark / #fff8ee light), the live gradients and shadows, and the inner `::after` frame (inset 10, radius 16).
- **Layout:** header "คิวเพลง" plus hint (22/30 margin). `.qlist` is flex:1 with overflow-y:auto and overscroll-behavior:contain. Rows are 104 tall and fill from the top.
- **Empty:** same panel and header, hint hidden (live: hint only when the queue is non-empty). Centered `.queue-empty` with a 54px mini disc and the live copy "ยังไม่มีเพลงรอ เพลงที่เพิ่มจะต่อจากเพลงนี้" (room-stage.tsx:814).
- **Idle deck:** disc stopped, monogram label, arm at rest, no player mounted; a tile in var(--field) with a 1px var(--line) inset. Progress idle; prev/play/next disabled using live disabled tokens.
- **Mobile:** full width below the add button. Empty: min-height 50vh. Otherwise the list scrolls at 60vh.

## Assumptions / gaps
- Queue thumbs stay static. Live spins them (`disc-spin 7s`, 2824), but earlier rounds required static round thumbs. Decide before dev.
- Live `.progress` is 70px tall with a 52px base. The base line sits at y 637 (draft 638), so hills rise into the gap under the meta line. On mobile they slightly touch the meta.
- Idle copy "ยังไม่มีเพลงที่กำลังเล่น" / "ยังไม่มีเพลงในห้อง" is new (live has no tile). The live empty-queue copy says "ต่อจากเพลงนี้" even with nothing playing; consider a variant.
- The glow is placed behind the vinyl. Live anchors it at deck left −40 / top 18%.

## R4.5.1: speaker control fix
The leftmost transport control was a wrong "ก" placeholder. It is now the live `SpeakerControl` trigger:
- **Source:** components/speaker-control.tsx:115-127, rendered at room-stage.tsx:668-676 inside `.transport-side`.
- **Icon:** `ROLE_ICON` at speaker-control.tsx:27-31. speaker → `SpeakerIcon`, listener → `HeadphonesIcon`, remote → `RemoteControlIcon` (@hugeicons/core-free-icons 4.3.5). Paths are copied verbatim.
- **Rendering:** `<Icon size={22}>`, which gives a 24-unit viewBox, currentColor and strokeWidth 1.6 (components/icon.tsx).
- **Colour:** var(--ink); remote uses var(--muted) (globals.css:3192-3195).
- **States:** inherits `.icon-btn` hover, press and focus. It is never disabled. `.speaker-flag` (3196-3205, 9px #c4601a dot) appears only for a non-speaker device whose main speaker is missing or offline, so it is not shown here.
- **aria-label:** the `summary` text (speaker-control.tsx:56-58). Every shot shows role=speaker in single mode: "เสียงเล่นที่ เครื่องนี้".
