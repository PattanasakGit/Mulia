# Mulia design source — room page (R4.5 mock)

Design reference for `wip/r46-ui-claude`. Use these files as the pixel source of truth for the room page, except where an exception below says otherwise.

## Files
- `mock-r4.5/html/R45.html` is the mock page; open it in a browser. Its styles are `R45.css` on top of `R44.css`, and `R45.js` handles the state toggles.
- `mock-r4.5/png/` has renders of each state (desk/mob × dark/light × playing/paused/empty/tap/hidden/scroll). Use them for visual overlay checks.
- `mock-r4.5/assets/` holds the fonts (`fonts.css`, `f*.woff2`), icons, and YouTube thumbnails that are placeholders only.
- `mock-r4.5/README.md` and `checks.json` are the mock notes and measured checks.
- `measure/measurements.json` has the exact geometry at 1440×810 (player, vinyl, arm pivot, queue card). `draft1024.png` is the user's original draft.
- `label/mulia-label-full.svg` is the gilt MULIA label for widths of 480px and up; `mulia-label-mark.svg` is for widths under 480px. PNG copies are 256×256.
- `compare/desk-draft-mock-build.png` and `mob-mock-build.png` show the draft, the mock and the older build side by side (before R4.6).

## Key 1440×810 targets
- Vinyl is 362px, offset right, with the player overlapping its left side. Arm pivot is at (503, 221), a painted gilt tonearm.
- Left deck is centred vertically and horizontally in its column, with title, meta, waveform and transport stacked and centred.
- Paste bar and the separate gold "เพิ่มเข้าคิว" button sit above the queue card.
- Queue card is at x638, y233, 760×496. It scrolls internally and its bottom lines up with the left column.
- The mock geometry applies from 1280px up; 981–1279px is fluid.

## Agreed exceptions (these override the mock)
1. YouTube player: 16:9 at 363×204.2 (not 220 high), radius 0, no shadow, no CSS transform, nothing over the iframe, at least 200×200 and fully visible. Spindle, label and vinyl sit below the iframe in z-order, and the arm never crosses it.
2. At 390: tonearm hidden; the people, share and close-room buttons stay visible; the header is one row.
3. Attribution and the footer (Terms · Privacy · YouTube ToS) stay below the player in normal page flow.
4. Waveform is read-only; tap-to-listen, no muted autoplay. Playback continues when the tab is hidden (the user's choice; this breaks YouTube policy III.I.9 if the site goes public).
5. Any other deviation from the mock needs PM/user approval. Don't copy mock bugs (the mobile queue offset and the queue-hint typo).

## Open design items (QA FAIL on R4.6)
- RQ-01: the 1440 light background is cooler and whiter than the warm mock palette.
- RQ-02: at 390 the progress element is 50px high (mock 70px) and transport still uses the old grid.
