# R4.6 UI polish - gap list vs mock

Base: `bff496d` (PR #2). Mock = `html/R45.html` + `R45.css` + `R44.css` from `r46-mock-src.tar.gz` (pixel truth, 1440x810 and <=600px rules).
Method: the same selectors were measured in local Playwright (system Chrome, `getBoundingClientRect` + `getComputedStyle`) on the mock (`file://.../R45.html?theme=dark|light&state=playing`) and on the live room page (`next start` on a seeded local Postgres QA room, 3 tracks, 4 members, this device = speaker so the speaker icon shows like the mock, playing/unlocked state through a stubbed YT API; real YT iframe used for the RMF numbers). Viewports: 1440x810, 800x900, 390x844; dark and light.
Appendix A has the raw per-element tables (`mock` vs `current`) for 1440 and 390, dark and light. Measurement tooling lives outside the repo.

## Hard constraints that override the mock

| Rule | Consequence |
|---|---|
| YouTube RMF: iframe >=200x200, 16:9, `border-radius:0`, no overlay, no transform on it or ancestors, fully on-screen | Player stays **363x204.2** (mock: 363x220, radius 8px, drop shadow). Mock `border-radius:8px` and the box-shadow on the player are NOT applied to the iframe/shell. |
| bff496d audio logic | `vinyl.tsx` / `room-stage.tsx` handlers untouched. Only class-less CSS and presentational markup are in scope. |
| 800 | Mock has no 800 frame (its <=600 rules do not apply at 800, and its 1440 absolute layout is not responsive). Accepted baseline = deck centred, player max `min(640px, 100vw-24px)`, 16:9. 800 must not regress. |

## Gap groups (IDs used in the commit messages)

Geometry reference at 1440x810 (mock `checks.json`): header 67px; divider x607 y98 h662; vinyl (177,148) 362; player (96,219) 363 wide; title (93,528) 447x36; meta (93,560) h26; progress (93,585) 447x70; times y648; transport y682 (pp 294,679 50x50); paste (644,146) 591x48; add (1250,145) 145x50; **queue card (638,233) 760x496, bottom 729 (= play-button bottom)**; row 1 (659,298) 718x104.

| ID | Where | Element | Mock | Current (bff496d, 1440 dark) | Fix plan |
|---|---|---|---|---|---|
| G1 | 1440 | header height | 67px | 72px | `.topbar` min-height 67 on the room page (>=1280) |
| G2 | 1440 | logo | x56, 22px / 500 / ls .42em, mark 31px with 2px ring | x20, 15px/500/ls .2em, mark 22px | brand rules scoped to `.topbar.is-room` |
| G3 | 1440 | people pill | x242, 139x36, 14px, bg `--hl`, border `--line` | x140, 134x38, 16px, gold border, tinted bg | pill rules |
| G4 | 1440 | me (avatar + name) | x412, avatar 38, 16px; no vertical divider | x288, avatar 32, 15px, divider `::before` | rules + hide divider |
| G5 | 1440 | room title block | centred, name 17/600/lh1.25, code 14/400 muted | name 17/500, code 11px ls .14em, right-aligned | rules |
| G6 | 1440 | close / share / theme | close 16/400 h44 no pill; share 109x44 bg `--hl` gold2 border; theme 48x44 bg `--hl` | 14/500 pill h40; share transparent h40; theme 56x40 transparent | rules |
| G7 | 1440 | footer | 14px; mock footer is below the fold (y830) | 13px, y758 h52 (overlaps content bottom 760 by 2px) | footer 50px high so main = 98..760; 14px |
| G8 | 1440 | deck grid | left column content centre x316.5; divider x607 y98; right column content x638..1398 | deck x40..1400, 1fr/1fr, divider x736 | `>=1280px` grid `607px / 1fr`, deck-side padding-left 30, padding-top for the paste row |
| G9 | 1440 | vinyl / player / tonearm | vinyl (177,148); player (96,219); arm (465,183) | (169,97.6) / (88,168.6) / (457,132.6) | deck-player top-aligned, visual offset (-8,+50.4) |
| G10 | 1440 | title | 23.5px / **500** / lh36, one line | 23.5px/600, wraps to 2 lines (71.9px) | weight 500, lh 36px, colour ink |
| G11 | 1440 | meta line | 16px lh26 mute; link gold, underlined | lh24, link muted | lh 26, link gold |
| G12 | 1440 | progress / times | progress y585, times 15px lh18 y648 | y591.5, times 13px lh20.8 y659.5 | explicit margins; times 15/18 |
| G13 | 1440 | transport | spk 124, ib1 212, pp 294 (50), ib2 382, vol 472, y682 | spk 136.5, ib1 273, pp 333.8, ib2 403, vol 539.5 | padding-inline 31/24, core gap 38 |
| G14 | 1440 | paste bar | (644,146) 591x48, 17px, field bg, no shadow | (761,88) 504x60, 16px, shadow | row sizing |
| G15 | 1440 | add button | (1250,145) 145x50, `--btn` bg, gold text | (1279,93) 121x50, white/gilt | row sizing |
| **G16 (M4)** | 1440 | **queue card** | **(638,233) 760x496, bottom 729** | (761,148) 639x496, bottom 644 | grid column + `add-row` height + margin-top 38; card height 496 |
| G17 | 1440 | queue header | margin 22/30, label 19/600 ink, hint 15 ink | label 13/400 muted, hint 13 muted | rules |
| G18 | 1440 | queue rows | 104px rows, grip 44, thumb 65, title 19/400 lh25 wraps (max ~245px), sub 15, adder = avatar 42 + 17px name (no pill, ~156px), delete 44, playing row = `--hl` bg + 1px gold border r10 | 78px rows, grip 28, thumb 52, title 17/600 truncated, sub 13, adder pill 74x32 | restyle `.queue li` grid |
| G19 | 1440+390 | colours | mock palette: ink #ece4d6 / #1d1912, mute #9a9286 / #5d564b, gold #f0c98f / #7a4f0e, line, hl, field, btn (see appendix) | live tokens #f4f1ea / #111, muted #b7b1a6 / #5c5852 ... | room-scoped `--m-*` variables only for the elements listed above; global tokens untouched |
| G20 | 390 | header | logo 18px mark 26; room name + code (right of logo group) + theme 48x44; people/me/close/share hidden | logo 15px, pill "4 ค" truncated, close, share, theme 56x40 | logo/theme rules + room name block. **Not applied:** hiding people/close/share (would remove invite, member list and close-room on phones). |
| G21 | 390 | deck | vinyl 260 at (132,66), player 356x200 (RMF: stays 16:9 363x204.2 / 358 wide), arm hidden | vinyl 362 at (94.5,69) clipped | keep RMF player; vinyl size per RMF-safe mock proportion; tonearm stays hidden |
| G22 | 390 | title / meta | 21px lh30 wraps, meta 14px | 22px/600, lh30 | 21px/500 |
| G23 | 390 | progress / times | progress h70 `margin:-14px 16px 0`, times 13px | progress h50 | rules |
| G24 | 390 | transport | 5 buttons at 12/31/50/69/88% | grid with spk left, vol right | rules |
| G25 | 390 | paste / add | paste 366x48 15px; add 366x48 `--btn` | paste 54px high | rules |
| G26 | 390 | queue | card 12px margin, rows 84, thumb 52, grip hidden, title 16/21, sub 13, adder avatar 34 only, delete 44 | rows 73-74px, thumb 44, grip visible, title truncated | rules |
| G27 | 800 | whole page | n/a | n/a | **no change** (baseline; M4 desktop rules only >=1280px) |
| G28 | all | light theme | same geometry; light palette values (see appendix) | | same variables |

## Not fixed / deviations (decided up-front)

* Player radius 8px + shadow and 220px height: RMF wins (0 radius, 204.2px).
* Mock hides people / me / close / share at 390: kept (functional); only restyled.
* Mock queue hint typo "จากเพื่อนเปลี่ยนลำดับ": kept live copy "ลากเพื่อเปลี่ยนลำดับ".
* Mock footer sits below the 810px fold (y830, 95px tall) and contains a placeholder "[Developed with YouTube - badge placeholder]": live keeps its real footer in view (50px).
* 981-1279px keeps the existing fluid 1fr/1fr desktop layout (mock has no frame there); exact mock coordinates apply from 1280px up.

## Baseline RMF numbers (bff496d, real YouTube iframe)

| viewport | iframe rect (x,y,w,h) | ratio | radius | ancestor transforms | centre hit | foreign-hit samples | on-screen | h-overflow |
|---|---|---|---|---|---|---|---|---|
| 1440x810 | 88, 157.6, 363x204.2 | 1.778 | 0 | none | IFRAME | 0/510 | yes | no |
| 800x900 | 128, 155, 363x204.2 | 1.778 | 0 | none | IFRAME | 0/510 | yes | no |
| 390x844 | 13.5, 140, 363x204.2 | 1.778 | 0 | none | IFRAME | 0/510 | yes | no |

## 800 baseline (accepted, live only; no mock)

| element | rect (x,y,w,h) |
|---|---|
| deck-player | 80, 84, 640x663 |
| deck-visual | 128, 84, 544x362 |
| vinyl | 209, 84, 362x362 |
| iframe shell | 128, 155, 363x204.2 |
| title | 218.5, 458, 363x70 |
| progress | 218.5, 576, 363x70 |
| paste / add | 12,774 641x60 / 667,779 121x50 |
| queue card | 30, 858, 740x266 |

## Appendix A - per-element measured differences (mock vs bff496d)

#### 1440 dark (mock vs bff496d)

| element | property | mock | current (bff496d) |
|---|---|---|---|
| `logo` | rect x,y,w,h | [56, 15.5, 161.9, 35] | [20, 13.5, 105.9, 44] |
| `logo` | fontSize | 22px | 16px |
| `logo` | fontWeight | 500 | 400 |
| `logo` | letterSpacing | 9.24px | normal |
| `logo` | color | rgb(236, 228, 214) | rgb(244, 241, 234) |
| `logoMark` | rect x,y,w,h | [56, 17.5, 31, 31] | [24, 24.5, 22, 22] |
| `logoMark` | borderRadius | 50% | 0px |
| `logoMark` | borderTopColor | rgb(236, 228, 214) | rgb(244, 241, 234) |
| `logoText` | rect x,y,w,h | [56, 15.5, 161.9, 35] | [56, 23.5, 65.9, 24] |
| `logoText` | fontSize | 22px | 15px |
| `logoText` | letterSpacing | 9.24px | 3px |
| `logoText` | color | rgb(236, 228, 214) | rgb(244, 241, 234) |
| `ppl` | rect x,y,w,h | [242, 15, 139, 36] | [139.9, 16.5, 134.1, 38] |
| `ppl` | backgroundColor | rgb(35, 30, 18) | color(srgb 0.108549 0.0972157 0.0787451) |
| `ppl` | borderTopColor | rgba(214, 180, 120, 0.18) | rgba(231, 194, 119, 0.42) |
| `ppl` | fontSize | 14px | 16px |
| `ppl` | color | rgb(236, 228, 214) | rgb(244, 241, 234) |
| `me` | rect x,y,w,h | [412, 14, 68.8, 38] | [288, 13.5, 82.2, 44] |
| `me` | fontSize | 16px | 15px |
| `me` | color | rgb(236, 228, 214) | rgb(244, 241, 234) |
| `meAv` | rect x,y,w,h | [412, 14, 38, 38] | [302, 19.5, 32, 32] |
| `meAv` | backgroundColor | rgb(243, 215, 181) | rgb(240, 225, 219) |
| `meAv` | boxShadow | none | rgba(17, 17, 17, 0.08) 0px 0px 0px 1px inset |
| `room` | rect x,y,w,h | [1012, 13.6, 101.4, 38.8] | [1031.9, 16.5, 117.2, 38] |
| `room` | fontSize | 17px | 16px |
| `room` | fontWeight | 600 | 400 |
| `room` | lineHeight | 21.25px | 25.6px |
| `room` | color | rgb(236, 228, 214) | rgb(244, 241, 234) |
| `close` | rect x,y,w,h | [1164, 11, 59.7, 44] | [1163.1, 15.5, 70.3, 40] |
| `close` | borderRadius | 0px | 999px |
| `close` | fontSize | 16px | 14px |
| `close` | fontWeight | 400 | 500 |
| `close` | color | rgb(236, 228, 214) | rgb(183, 177, 166) |
| `share` | rect x,y,w,h | [1240, 11, 109, 44] | [1247.3, 15.5, 106.7, 40] |
| `share` | backgroundColor | rgb(35, 30, 18) | rgba(0, 0, 0, 0) |
| `share` | borderTopColor | rgb(217, 168, 92) | rgba(231, 194, 119, 0.42) |
| `share` | fontWeight | 400 | 500 |
| `share` | color | rgb(240, 201, 143) | rgb(236, 208, 154) |
| `thm` | rect x,y,w,h | [1361, 11, 48, 44] | [1364, 15.5, 56, 40] |
| `thm` | backgroundColor | rgb(35, 30, 18) | rgba(0, 0, 0, 0) |
| `thm` | borderTopColor | rgba(214, 180, 120, 0.18) | rgb(46, 43, 39) |
| `thm` | fontSize | 14px | 16px |
| `thm` | color | rgb(236, 228, 214) | rgb(183, 177, 166) |
| `vinyl` | rect x,y,w,h | [177, 148, 362, 362] | [169, 97.6, 362, 362] |
| `shell` | rect x,y,w,h | [96, 219, 363, 220] | [88, 168.6, 363, 204.2] |
| `shell` | backgroundColor | rgb(0, 0, 0) | rgba(0, 0, 0, 0) |
| `shell` | borderRadius | 8px | 0px |
| `shell` | boxShadow | rgba(255, 255, 255, 0.12) 0px 0px 0px 1px, rgba(0, 0, 0, 0.55) 0px 18px 40px 0px | none |
| `arm` | rect x,y,w,h | [465, 183, 80, 262] | [457, 132.6, 80, 262] |
| `ttl` | rect x,y,w,h | [93, 528, 447, 36] | [136.5, 471.6, 447, 71.9] |
| `ttl` | fontWeight | 500 | 600 |
| `ttl` | lineHeight | 36px | 35.955px |
| `ttl` | color | rgb(236, 228, 214) | rgb(244, 241, 234) |
| `meta` | rect x,y,w,h | [93, 560, 447, 26] | [136.5, 551.5, 447, 24] |
| `meta` | lineHeight | 26px | 24px |
| `meta` | color | rgb(154, 146, 134) | rgb(183, 177, 166) |
| `metaLink` | rect x,y,w,h | [327.1, 551, 119.1, 44] | [366.6, 541.5, 127.1, 44] |
| `metaLink` | lineHeight | 26px | 24px |
| `metaLink` | color | rgb(240, 201, 143) | rgb(183, 177, 166) |
| `progress` | rect x,y,w,h | [93, 585, 447, 70] | [136.5, 591.5, 447, 70] |
| `times` | rect x,y,w,h | [93, 648, 447, 18] | [136.5, 659.5, 447, 20.8] |
| `times` | fontSize | 15px | 13px |
| `times` | lineHeight | 18px | 20.8px |
| `times` | color | rgb(154, 146, 134) | rgb(183, 177, 166) |
| `pp` | rect x,y,w,h | [294, 679, 50, 50] | [333.8, 689.1, 52.5, 52.5] |
| `ib1` | rect x,y,w,h | [212, 682, 44, 44] | [273, 693.3, 44, 44] |
| `ib2` | rect x,y,w,h | [382, 682, 44, 44] | [403, 693.3, 44, 44] |
| `spk` | rect x,y,w,h | [124, 682, 44, 44] | [136.5, 693.3, 44, 44] |
| `vol` | rect x,y,w,h | [472, 682, 44, 44] | [539.5, 693.3, 44, 44] |
| `paste` | rect x,y,w,h | [644, 146, 591, 48] | [761, 88, 504.4, 60] |
| `paste` | backgroundColor | rgb(10, 9, 9) | rgb(20, 19, 17) |
| `paste` | borderTopColor | rgba(214, 180, 120, 0.18) | rgb(63, 59, 53) |
| `paste` | boxShadow | none | rgba(60, 40, 14, 0.06) 0px 10px 28px 0px |
| `paste` | fontSize | 17px | 16px |
| `paste` | color | rgb(154, 146, 134) | rgb(244, 241, 234) |
| `add` | rect x,y,w,h | [1250, 145, 145, 50] | [1279.4, 93, 120.6, 50] |
| `add` | backgroundColor | rgb(38, 36, 31) | rgb(20, 19, 17) |
| `add` | borderTopColor | rgba(214, 180, 120, 0.18) | rgb(63, 59, 53) |
| `add` | boxShadow | none | rgba(60, 40, 14, 0.06) 0px 10px 28px 0px |
| `add` | color | rgb(240, 201, 143) | rgb(163, 113, 31) |
| `q` | rect x,y,w,h | [638, 233, 760, 496] | [761, 148, 639, 496] |
| `qh` | rect x,y,w,h | [669, 256, 698, 36] | [784, 171, 593, 20.8] |
| `qlabel` | rect x,y,w,h | [669, 259, 64.6, 30] | [784, 171, 43.1, 20.8] |
| `qlabel` | fontSize | 19px | 13px |
| `qlabel` | fontWeight | 600 | 400 |
| `qlabel` | color | rgb(236, 228, 214) | rgb(183, 177, 166) |
| `qhint` | rect x,y,w,h | [1098.2, 262, 268.8, 24] | [1152.3, 171, 224.8, 20.8] |
| `qhint` | fontSize | 15px | 13px |
| `qhint` | color | rgb(236, 228, 214) | rgb(183, 177, 166) |
| `qlist` | rect x,y,w,h | [639, 292, 758, 425] | [784, 203.8, 593, 421.2] |
| `row1` | rect x,y,w,h | [659, 298, 718, 104] | [788, 211.8, 581, 78.3] |
| `row1` | backgroundColor | rgb(35, 30, 18) | rgba(0, 0, 0, 0) |
| `row1` | borderRadius | 10px | 0px |
| `row1` | borderTopColor | rgba(217, 168, 92, 0.35) | rgb(244, 241, 234) |
| `row2` | rect x,y,w,h | [659, 402, 718, 104] | [788, 290.1, 581, 79.3] |
| `row2` | borderTopColor | rgb(236, 228, 214) | rgba(0, 0, 0, 0) |
| `disc1` | rect x,y,w,h | [730, 317.5, 65, 65] | [832, 224.9, 52, 52] |
| `disc1` | boxShadow | none | rgba(231, 194, 119, 0.5) 0px 0px 0px 1.5px, rgba(212, 170, 92, 0.1) 0px 0px 0px 4px, rgba(150, 104, 36, 0.3) 0px 8px 20px 0px |
| `title1` | rect x,y,w,h | [817, 310, 244.5, 80] | [896, 226.8, 322.5, 25.5] |
| `title1` | fontSize | 19px | 17px |
| `title1` | fontWeight | 400 | 600 |
| `title1` | lineHeight | 25px | 25.5px |
| `title1` | color | rgb(236, 228, 214) | rgb(236, 208, 154) |
| `sub1` | rect x,y,w,h | [817, 364, 244.5, 26] | [896, 254.3, 322.5, 20.8] |
| `sub1` | fontSize | 15px | 13px |
| `sub1` | lineHeight | 25px | 20.8px |
| `sub1` | color | rgb(154, 146, 134) | rgb(183, 177, 166) |
| `adderName1` | rect x,y,w,h | [1215.5, 336.5, 33.4, 27] | [1266.5, 240.5, 25.5, 20.8] |
| `adderName1` | fontSize | 17px | 13px |
| `adderName1` | color | rgb(236, 228, 214) | rgb(183, 177, 166) |
| `adder1` | rect x,y,w,h | [1161.5, 329, 156.5, 42] | [1230.5, 234.9, 74.5, 32] |
| `adder1` | borderRadius | 0px | 999px |
| `adder1` | borderTopColor | rgb(236, 228, 214) | rgb(46, 43, 39) |
| `del1` | rect x,y,w,h | [1318, 328, 44, 44] | [1317, 228.9, 44, 44] |
| `del1` | borderRadius | 0px | 10px |
| `grip1` | rect x,y,w,h | [672, 328, 44, 44] | [792, 228.9, 28, 44] |
| `grip1` | borderRadius | 0px | 10px |
| `now1` | rect x,y,w,h | [817, 365, 68, 25] | [896, 255.2, 59.5, 19.2] |
| `now1` | fontSize | 15px | 12px |
| `now1` | lineHeight | 25px | 19.2px |
| `now1` | letterSpacing | normal | 0.48px |
| `now1` | color | rgb(240, 201, 143) | rgb(236, 208, 154) |
| `foot` | rect x,y,w,h | [0, 830, 1440, 95] | [0, 757.8, 1440, 52.2] |
| `foot` | backgroundColor | rgba(0, 0, 0, 0) | color(srgb 0.0470588 0.0431373 0.0392157 / 0.88) |
| `foot` | borderTopColor | rgba(214, 180, 120, 0.18) | rgb(46, 43, 39) |
| `foot` | fontSize | 14px | 13px |
| `foot` | color | rgb(154, 146, 134) | rgb(183, 177, 166) |
| `hdr` | rect x,y,w,h | [0, 0, 1440, 67] | [0, 0, 1440, 72] |
| `hdr` | backgroundColor | rgba(0, 0, 0, 0) | color(srgb 0.0470588 0.0431373 0.0392157 / 0.82) |

#### 1440 light (mock vs bff496d)

| element | property | mock | current (bff496d) |
|---|---|---|---|
| `logo` | rect x,y,w,h | [56, 15.5, 161.9, 35] | [20, 13.5, 105.9, 44] |
| `logo` | fontSize | 22px | 16px |
| `logo` | fontWeight | 500 | 400 |
| `logo` | letterSpacing | 9.24px | normal |
| `logo` | color | rgb(29, 25, 18) | rgb(17, 17, 17) |
| `logoMark` | rect x,y,w,h | [56, 17.5, 31, 31] | [24, 24.5, 22, 22] |
| `logoMark` | borderRadius | 50% | 0px |
| `logoMark` | borderTopColor | rgb(29, 25, 18) | rgb(17, 17, 17) |
| `logoText` | rect x,y,w,h | [56, 15.5, 161.9, 35] | [56, 23.5, 65.9, 24] |
| `logoText` | fontSize | 22px | 15px |
| `logoText` | letterSpacing | 9.24px | 3px |
| `logoText` | color | rgb(29, 25, 18) | rgb(17, 17, 17) |
| `ppl` | rect x,y,w,h | [242, 15, 139, 36] | [139.9, 16.5, 134.1, 38] |
| `ppl` | backgroundColor | rgb(241, 228, 200) | color(srgb 0.941176 0.925176 0.894745) |
| `ppl` | borderTopColor | rgba(90, 64, 20, 0.22) | rgba(176, 128, 52, 0.45) |
| `ppl` | fontSize | 14px | 16px |
| `ppl` | color | rgb(29, 25, 18) | rgb(17, 17, 17) |
| `me` | rect x,y,w,h | [412, 14, 68.8, 38] | [288, 13.5, 82.2, 44] |
| `me` | fontSize | 16px | 15px |
| `me` | color | rgb(29, 25, 18) | rgb(17, 17, 17) |
| `meAv` | rect x,y,w,h | [412, 14, 38, 38] | [302, 19.5, 32, 32] |
| `meAv` | backgroundColor | rgb(243, 215, 181) | rgb(240, 225, 219) |
| `meAv` | boxShadow | none | rgba(17, 17, 17, 0.08) 0px 0px 0px 1px inset |
| `room` | rect x,y,w,h | [1012, 13.6, 101.4, 38.8] | [1031.9, 16.5, 117.2, 38] |
| `room` | fontSize | 17px | 16px |
| `room` | fontWeight | 600 | 400 |
| `room` | lineHeight | 21.25px | 25.6px |
| `room` | color | rgb(29, 25, 18) | rgb(17, 17, 17) |
| `close` | rect x,y,w,h | [1164, 11, 59.7, 44] | [1163.1, 15.5, 70.3, 40] |
| `close` | borderRadius | 0px | 999px |
| `close` | fontSize | 16px | 14px |
| `close` | fontWeight | 400 | 500 |
| `close` | color | rgb(29, 25, 18) | rgb(92, 88, 82) |
| `share` | rect x,y,w,h | [1240, 11, 109, 44] | [1247.3, 15.5, 106.7, 40] |
| `share` | backgroundColor | rgb(241, 228, 200) | rgba(0, 0, 0, 0) |
| `share` | borderTopColor | rgb(138, 90, 18) | rgba(176, 128, 52, 0.45) |
| `share` | fontWeight | 400 | 500 |
| `share` | color | rgb(122, 79, 14) | rgb(147, 102, 31) |
| `thm` | rect x,y,w,h | [1361, 11, 48, 44] | [1364, 15.5, 56, 40] |
| `thm` | backgroundColor | rgb(241, 228, 200) | rgba(0, 0, 0, 0) |
| `thm` | borderTopColor | rgba(90, 64, 20, 0.22) | rgb(230, 226, 218) |
| `thm` | fontSize | 14px | 16px |
| `thm` | color | rgb(29, 25, 18) | rgb(92, 88, 82) |
| `vinyl` | rect x,y,w,h | [177, 148, 362, 362] | [169, 97.6, 362, 362] |
| `shell` | rect x,y,w,h | [96, 219, 363, 220] | [88, 168.6, 363, 204.2] |
| `shell` | backgroundColor | rgb(0, 0, 0) | rgba(0, 0, 0, 0) |
| `shell` | borderRadius | 8px | 0px |
| `shell` | boxShadow | rgba(255, 255, 255, 0.12) 0px 0px 0px 1px, rgba(0, 0, 0, 0.55) 0px 18px 40px 0px | none |
| `arm` | rect x,y,w,h | [465, 183, 80, 262] | [457, 132.6, 80, 262] |
| `ttl` | rect x,y,w,h | [93, 528, 447, 36] | [136.5, 471.6, 447, 71.9] |
| `ttl` | fontWeight | 500 | 600 |
| `ttl` | lineHeight | 36px | 35.955px |
| `ttl` | color | rgb(29, 25, 18) | rgb(17, 17, 17) |
| `meta` | rect x,y,w,h | [93, 560, 447, 26] | [136.5, 551.5, 447, 24] |
| `meta` | lineHeight | 26px | 24px |
| `meta` | color | rgb(93, 86, 75) | rgb(92, 88, 82) |
| `metaLink` | rect x,y,w,h | [327.1, 551, 119.1, 44] | [366.6, 541.5, 127.1, 44] |
| `metaLink` | lineHeight | 26px | 24px |
| `metaLink` | color | rgb(122, 79, 14) | rgb(92, 88, 82) |
| `progress` | rect x,y,w,h | [93, 585, 447, 70] | [136.5, 591.5, 447, 70] |
| `times` | rect x,y,w,h | [93, 648, 447, 18] | [136.5, 659.5, 447, 20.8] |
| `times` | fontSize | 15px | 13px |
| `times` | lineHeight | 18px | 20.8px |
| `times` | color | rgb(93, 86, 75) | rgb(92, 88, 82) |
| `pp` | rect x,y,w,h | [294, 679, 50, 50] | [333.8, 689.1, 52.5, 52.5] |
| `ib1` | rect x,y,w,h | [212, 682, 44, 44] | [273, 693.3, 44, 44] |
| `ib2` | rect x,y,w,h | [382, 682, 44, 44] | [403, 693.3, 44, 44] |
| `spk` | rect x,y,w,h | [124, 682, 44, 44] | [136.5, 693.3, 44, 44] |
| `vol` | rect x,y,w,h | [472, 682, 44, 44] | [539.5, 693.3, 44, 44] |
| `paste` | rect x,y,w,h | [644, 146, 591, 48] | [761, 88, 504.4, 60] |
| `paste` | backgroundColor | rgb(255, 253, 248) | rgb(255, 255, 255) |
| `paste` | borderTopColor | rgba(90, 64, 20, 0.22) | rgb(213, 208, 198) |
| `paste` | boxShadow | none | rgba(60, 40, 14, 0.06) 0px 10px 28px 0px |
| `paste` | fontSize | 17px | 16px |
| `paste` | color | rgb(93, 86, 75) | rgb(17, 17, 17) |
| `add` | rect x,y,w,h | [1250, 145, 145, 50] | [1279.4, 93, 120.6, 50] |
| `add` | backgroundColor | rgb(236, 226, 207) | rgb(255, 255, 255) |
| `add` | borderTopColor | rgba(90, 64, 20, 0.22) | rgb(213, 208, 198) |
| `add` | boxShadow | none | rgba(60, 40, 14, 0.06) 0px 10px 28px 0px |
| `add` | color | rgb(122, 79, 14) | rgb(163, 113, 31) |
| `q` | rect x,y,w,h | [638, 233, 760, 496] | [761, 148, 639, 496] |
| `qh` | rect x,y,w,h | [669, 256, 698, 36] | [784, 171, 593, 20.8] |
| `qlabel` | rect x,y,w,h | [669, 259, 64.6, 30] | [784, 171, 43.1, 20.8] |
| `qlabel` | fontSize | 19px | 13px |
| `qlabel` | fontWeight | 600 | 400 |
| `qlabel` | color | rgb(29, 25, 18) | rgb(92, 88, 82) |
| `qhint` | rect x,y,w,h | [1098.2, 262, 268.8, 24] | [1152.3, 171, 224.8, 20.8] |
| `qhint` | fontSize | 15px | 13px |
| `qhint` | color | rgb(29, 25, 18) | rgb(92, 88, 82) |
| `qlist` | rect x,y,w,h | [639, 292, 758, 425] | [784, 203.8, 593, 421.2] |
| `row1` | rect x,y,w,h | [659, 298, 718, 104] | [788, 211.8, 581, 78.3] |
| `row1` | backgroundColor | rgb(241, 228, 200) | rgba(0, 0, 0, 0) |
| `row1` | borderRadius | 10px | 0px |
| `row1` | borderTopColor | rgba(217, 168, 92, 0.35) | rgb(17, 17, 17) |
| `row2` | rect x,y,w,h | [659, 402, 718, 104] | [788, 290.1, 581, 79.3] |
| `row2` | borderTopColor | rgb(29, 25, 18) | rgba(0, 0, 0, 0) |
| `disc1` | rect x,y,w,h | [730, 317.5, 65, 65] | [832, 224.9, 52, 52] |
| `disc1` | boxShadow | none | rgba(176, 128, 52, 0.5) 0px 0px 0px 1.5px, rgba(201, 151, 63, 0.11) 0px 0px 0px 4px, rgba(150, 104, 36, 0.3) 0px 8px 20px 0px |
| `title1` | rect x,y,w,h | [817, 310, 244.5, 80] | [896, 226.8, 322.5, 25.5] |
| `title1` | fontSize | 19px | 17px |
| `title1` | fontWeight | 400 | 600 |
| `title1` | lineHeight | 25px | 25.5px |
| `title1` | color | rgb(29, 25, 18) | rgb(154, 107, 34) |
| `sub1` | rect x,y,w,h | [817, 364, 244.5, 26] | [896, 254.3, 322.5, 20.8] |
| `sub1` | fontSize | 15px | 13px |
| `sub1` | lineHeight | 25px | 20.8px |
| `sub1` | color | rgb(93, 86, 75) | rgb(92, 88, 82) |
| `adderName1` | rect x,y,w,h | [1215.5, 336.5, 33.4, 27] | [1266.5, 240.5, 25.5, 20.8] |
| `adderName1` | fontSize | 17px | 13px |
| `adderName1` | color | rgb(29, 25, 18) | rgb(92, 88, 82) |
| `adder1` | rect x,y,w,h | [1161.5, 329, 156.5, 42] | [1230.5, 234.9, 74.5, 32] |
| `adder1` | borderRadius | 0px | 999px |
| `adder1` | borderTopColor | rgb(29, 25, 18) | rgb(230, 226, 218) |
| `del1` | rect x,y,w,h | [1318, 328, 44, 44] | [1317, 228.9, 44, 44] |
| `del1` | borderRadius | 0px | 10px |
| `grip1` | rect x,y,w,h | [672, 328, 44, 44] | [792, 228.9, 28, 44] |
| `grip1` | borderRadius | 0px | 10px |
| `now1` | rect x,y,w,h | [817, 365, 68, 25] | [896, 255.2, 59.5, 19.2] |
| `now1` | fontSize | 15px | 12px |
| `now1` | lineHeight | 25px | 19.2px |
| `now1` | letterSpacing | normal | 0.48px |
| `now1` | color | rgb(122, 79, 14) | rgb(154, 107, 34) |
| `foot` | rect x,y,w,h | [0, 830, 1440, 95] | [0, 757.8, 1440, 52.2] |
| `foot` | backgroundColor | rgba(0, 0, 0, 0) | color(srgb 0.968627 0.964706 0.952941 / 0.88) |
| `foot` | borderTopColor | rgba(90, 64, 20, 0.22) | rgb(230, 226, 218) |
| `foot` | fontSize | 14px | 13px |
| `foot` | color | rgb(93, 86, 75) | rgb(92, 88, 82) |
| `hdr` | rect x,y,w,h | [0, 0, 1440, 67] | [0, 0, 1440, 72] |
| `hdr` | backgroundColor | rgba(0, 0, 0, 0) | color(srgb 0.968627 0.964706 0.952941 / 0.82) |

#### 390 dark (mock vs bff496d)

| element | property | mock | current (bff496d) |
|---|---|---|---|
| `logo` | rect x,y,w,h | [14, 13, 134.9, 29] | [12, 4, 105.9, 44] |
| `logo` | fontSize | 18px | 16px |
| `logo` | fontWeight | 500 | 400 |
| `logo` | letterSpacing | 7.56px | normal |
| `logo` | color | rgb(236, 228, 214) | rgb(244, 241, 234) |
| `logoMark` | rect x,y,w,h | [14, 14.5, 26, 26] | [16, 15, 22, 22] |
| `logoMark` | borderRadius | 50% | 0px |
| `logoMark` | borderTopColor | rgb(236, 228, 214) | rgb(244, 241, 234) |
| `logoText` | rect x,y,w,h | [14, 13, 134.9, 29] | [48, 14, 65.9, 24] |
| `logoText` | fontSize | 18px | 15px |
| `logoText` | letterSpacing | 7.56px | 3px |
| `logoText` | color | rgb(236, 228, 214) | rgb(244, 241, 234) |
| `ppl` | visibility | hidden in mock (display:none) | visible [125.9, 7, 97.4, 38] |
| `me` | visibility | hidden in mock (display:none) | visible [231.3, 4, 54, 44] |
| `meAv` | visibility | hidden in mock (display:none) | visible [245.3, 10, 32, 32] |
| `close` | visibility | hidden in mock (display:none) | visible [195.8, 6, 70.3, 40] |
| `share` | visibility | hidden in mock (display:none) | visible [274, 4, 44, 44] |
| `thm` | rect x,y,w,h | [330, 5.5, 48, 44] | [322, 6, 56, 40] |
| `thm` | backgroundColor | rgb(35, 30, 18) | rgba(0, 0, 0, 0) |
| `thm` | borderTopColor | rgba(214, 180, 120, 0.18) | rgb(46, 43, 39) |
| `thm` | fontSize | 14px | 16px |
| `thm` | color | rgb(236, 228, 214) | rgb(183, 177, 166) |
| `vinyl` | rect x,y,w,h | [132, 66, 260, 260] | [94.5, 69, 362, 362] |
| `shell` | rect x,y,w,h | [8, 64, 356, 200] | [13.5, 140, 363, 204.2] |
| `shell` | backgroundColor | rgb(0, 0, 0) | rgba(0, 0, 0, 0) |
| `shell` | borderRadius | 8px | 0px |
| `shell` | boxShadow | rgba(255, 255, 255, 0.12) 0px 0px 0px 1px, rgba(0, 0, 0, 0.55) 0px 18px 40px 0px | none |
| `ttl` | rect x,y,w,h | [16, 346, 358, 60] | [13.5, 443, 363, 60] |
| `ttl` | fontSize | 23.5px | 24px |
| `ttl` | fontWeight | 500 | 600 |
| `ttl` | color | rgb(236, 228, 214) | rgb(244, 241, 234) |
| `meta` | rect x,y,w,h | [16, 406, 358, 26] | [18.9, 511, 352.2, 24] |
| `meta` | fontSize | 14px | 15px |
| `meta` | lineHeight | 26px | 22.5px |
| `meta` | color | rgb(154, 146, 134) | rgb(183, 177, 166) |
| `metaLink` | rect x,y,w,h | [204.3, 397, 104.3, 44] | [200.9, 501, 119.7, 44] |
| `metaLink` | fontSize | 14px | 15px |
| `metaLink` | lineHeight | 26px | 22.5px |
| `metaLink` | color | rgb(240, 201, 143) | rgb(183, 177, 166) |
| `progress` | rect x,y,w,h | [16, 418, 358, 70] | [13.5, 551, 363, 50] |
| `times` | rect x,y,w,h | [16, 490, 358, 18] | [13.5, 599, 363, 20.8] |
| `times` | lineHeight | 18px | 20.8px |
| `times` | color | rgb(154, 146, 134) | rgb(183, 177, 166) |
| `pp` | rect x,y,w,h | [170, 511, 50, 50] | [168.8, 628.5, 52.5, 52.5] |
| `ib1` | rect x,y,w,h | [98.9, 514, 44, 44] | [116, 632.8, 44, 44] |
| `ib2` | rect x,y,w,h | [247.1, 514, 44, 44] | [230, 632.8, 44, 44] |
| `spk` | rect x,y,w,h | [24.8, 514, 44, 44] | [13.5, 632.8, 44, 44] |
| `vol` | rect x,y,w,h | [321.2, 514, 44, 44] | [332.5, 632.8, 44, 44] |
| `paste` | rect x,y,w,h | [12, 586, 366, 48] | [12, 704.8, 366, 54] |
| `paste` | backgroundColor | rgb(10, 9, 9) | rgb(20, 19, 17) |
| `paste` | borderTopColor | rgba(214, 180, 120, 0.18) | rgb(63, 59, 53) |
| `paste` | boxShadow | none | rgba(60, 40, 14, 0.06) 0px 10px 28px 0px |
| `paste` | fontSize | 15px | 16px |
| `paste` | color | rgb(154, 146, 134) | rgb(244, 241, 234) |
| `add` | rect x,y,w,h | [12, 644, 366, 48] | [12, 768.8, 366, 48] |
| `add` | backgroundColor | rgb(38, 36, 31) | rgb(20, 19, 17) |
| `add` | borderTopColor | rgba(214, 180, 120, 0.18) | rgb(63, 59, 53) |
| `add` | boxShadow | none | rgba(60, 40, 14, 0.06) 0px 10px 28px 0px |
| `add` | color | rgb(240, 201, 143) | rgb(163, 113, 31) |
| `q` | rect x,y,w,h | [12, 939, 366, 337] | [20, 834.8, 350, 296.7] |
| `qh` | rect x,y,w,h | [37, 960, 316, 36] | [33, 853.8, 324, 20.8] |
| `qlabel` | rect x,y,w,h | [37, 963, 64.6, 30] | [33, 853.8, 43.1, 20.8] |
| `qlabel` | fontSize | 19px | 13px |
| `qlabel` | fontWeight | 600 | 400 |
| `qlabel` | color | rgb(236, 228, 214) | rgb(183, 177, 166) |
| `qlist` | rect x,y,w,h | [13, 996, 364, 268] | [33, 886.6, 324, 229.9] |
| `row1` | rect x,y,w,h | [27, 1000, 336, 84] | [37, 894.6, 312, 73.3] |
| `row1` | backgroundColor | rgb(35, 30, 18) | rgba(0, 0, 0, 0) |
| `row1` | borderRadius | 10px | 0px |
| `row1` | borderTopColor | rgba(217, 168, 92, 0.35) | rgb(244, 241, 234) |
| `row2` | rect x,y,w,h | [27, 1084, 336, 84] | [37, 967.9, 312, 74.3] |
| `row2` | borderTopColor | rgb(236, 228, 214) | rgba(0, 0, 0, 0) |
| `disc1` | rect x,y,w,h | [38, 1016, 52, 52] | [69, 909.2, 44, 44] |
| `disc1` | boxShadow | none | rgba(231, 194, 119, 0.5) 0px 0px 0px 1.5px, rgba(212, 170, 92, 0.1) 0px 0px 0px 4px, rgba(150, 104, 36, 0.3) 0px 8px 20px 0px |
| `title1` | rect x,y,w,h | [102, 1008, 174, 68] | [123, 908.6, 140, 22.5] |
| `title1` | fontSize | 16px | 15px |
| `title1` | fontWeight | 400 | 600 |
| `title1` | lineHeight | 21px | 22.5px |
| `title1` | color | rgb(236, 228, 214) | rgb(236, 208, 154) |
| `sub1` | rect x,y,w,h | [102, 1054, 174, 22] | [123, 933.1, 140, 20.8] |
| `sub1` | lineHeight | 21px | 20.8px |
| `sub1` | color | rgb(154, 146, 134) | rgb(183, 177, 166) |
| `adder1` | rect x,y,w,h | [282, 1025, 34, 34] | [273, 919.2, 24, 24] |
| `adder1` | borderRadius | 0px | 999px |
| `del1` | rect x,y,w,h | [316, 1020, 44, 44] | [301, 909.2, 44, 44] |
| `del1` | borderRadius | 0px | 10px |
| `grip1` | visibility | hidden in mock (display:none) | visible [37, 909.2, 22, 44] |
| `now1` | rect x,y,w,h | [102, 1055, 60.5, 21] | [123, 934, 59.5, 19.2] |
| `now1` | fontSize | 13px | 12px |
| `now1` | lineHeight | 21px | 19.2px |
| `now1` | letterSpacing | normal | 0.48px |
| `now1` | color | rgb(240, 201, 143) | rgb(236, 208, 154) |
| `foot` | rect x,y,w,h | [0, 1063, 390, 129] | [0, 1147.5, 390, 84.2] |
| `foot` | backgroundColor | rgba(0, 0, 0, 0) | color(srgb 0.0470588 0.0431373 0.0392157 / 0.88) |
| `foot` | borderTopColor | rgba(214, 180, 120, 0.18) | rgb(46, 43, 39) |
| `foot` | fontSize | 14px | 13px |
| `foot` | color | rgb(154, 146, 134) | rgb(183, 177, 166) |
| `hdr` | rect x,y,w,h | [0, 0, 390, 56] | [0, 0, 390, 57] |
| `hdr` | backgroundColor | rgba(0, 0, 0, 0) | color(srgb 0.0470588 0.0431373 0.0392157 / 0.82) |

#### 390 light (mock vs bff496d)

| element | property | mock | current (bff496d) |
|---|---|---|---|
| `logo` | rect x,y,w,h | [14, 13, 134.9, 29] | [12, 4, 105.9, 44] |
| `logo` | fontSize | 18px | 16px |
| `logo` | fontWeight | 500 | 400 |
| `logo` | letterSpacing | 7.56px | normal |
| `logo` | color | rgb(29, 25, 18) | rgb(17, 17, 17) |
| `logoMark` | rect x,y,w,h | [14, 14.5, 26, 26] | [16, 15, 22, 22] |
| `logoMark` | borderRadius | 50% | 0px |
| `logoMark` | borderTopColor | rgb(29, 25, 18) | rgb(17, 17, 17) |
| `logoText` | rect x,y,w,h | [14, 13, 134.9, 29] | [48, 14, 65.9, 24] |
| `logoText` | fontSize | 18px | 15px |
| `logoText` | letterSpacing | 7.56px | 3px |
| `logoText` | color | rgb(29, 25, 18) | rgb(17, 17, 17) |
| `ppl` | visibility | hidden in mock (display:none) | visible [125.9, 7, 97.4, 38] |
| `me` | visibility | hidden in mock (display:none) | visible [231.3, 4, 54, 44] |
| `meAv` | visibility | hidden in mock (display:none) | visible [245.3, 10, 32, 32] |
| `close` | visibility | hidden in mock (display:none) | visible [195.8, 6, 70.3, 40] |
| `share` | visibility | hidden in mock (display:none) | visible [274, 4, 44, 44] |
| `thm` | rect x,y,w,h | [330, 5.5, 48, 44] | [322, 6, 56, 40] |
| `thm` | backgroundColor | rgb(241, 228, 200) | rgba(0, 0, 0, 0) |
| `thm` | borderTopColor | rgba(90, 64, 20, 0.22) | rgb(230, 226, 218) |
| `thm` | fontSize | 14px | 16px |
| `thm` | color | rgb(29, 25, 18) | rgb(92, 88, 82) |
| `vinyl` | rect x,y,w,h | [132, 66, 260, 260] | [94.5, 69, 362, 362] |
| `shell` | rect x,y,w,h | [8, 64, 356, 200] | [13.5, 140, 363, 204.2] |
| `shell` | backgroundColor | rgb(0, 0, 0) | rgba(0, 0, 0, 0) |
| `shell` | borderRadius | 8px | 0px |
| `shell` | boxShadow | rgba(255, 255, 255, 0.12) 0px 0px 0px 1px, rgba(0, 0, 0, 0.55) 0px 18px 40px 0px | none |
| `ttl` | rect x,y,w,h | [16, 346, 358, 60] | [13.5, 443, 363, 60] |
| `ttl` | fontSize | 23.5px | 24px |
| `ttl` | fontWeight | 500 | 600 |
| `ttl` | color | rgb(29, 25, 18) | rgb(17, 17, 17) |
| `meta` | rect x,y,w,h | [16, 406, 358, 26] | [18.9, 511, 352.2, 24] |
| `meta` | fontSize | 14px | 15px |
| `meta` | lineHeight | 26px | 22.5px |
| `meta` | color | rgb(93, 86, 75) | rgb(92, 88, 82) |
| `metaLink` | rect x,y,w,h | [204.3, 397, 104.3, 44] | [200.9, 501, 119.7, 44] |
| `metaLink` | fontSize | 14px | 15px |
| `metaLink` | lineHeight | 26px | 22.5px |
| `metaLink` | color | rgb(122, 79, 14) | rgb(92, 88, 82) |
| `progress` | rect x,y,w,h | [16, 418, 358, 70] | [13.5, 551, 363, 50] |
| `times` | rect x,y,w,h | [16, 490, 358, 18] | [13.5, 599, 363, 20.8] |
| `times` | lineHeight | 18px | 20.8px |
| `times` | color | rgb(93, 86, 75) | rgb(92, 88, 82) |
| `pp` | rect x,y,w,h | [170, 511, 50, 50] | [168.8, 628.5, 52.5, 52.5] |
| `ib1` | rect x,y,w,h | [98.9, 514, 44, 44] | [116, 632.8, 44, 44] |
| `ib2` | rect x,y,w,h | [247.1, 514, 44, 44] | [230, 632.8, 44, 44] |
| `spk` | rect x,y,w,h | [24.8, 514, 44, 44] | [13.5, 632.8, 44, 44] |
| `vol` | rect x,y,w,h | [321.2, 514, 44, 44] | [332.5, 632.8, 44, 44] |
| `paste` | rect x,y,w,h | [12, 586, 366, 48] | [12, 704.8, 366, 54] |
| `paste` | backgroundColor | rgb(255, 253, 248) | rgb(255, 255, 255) |
| `paste` | borderTopColor | rgba(90, 64, 20, 0.22) | rgb(213, 208, 198) |
| `paste` | boxShadow | none | rgba(60, 40, 14, 0.06) 0px 10px 28px 0px |
| `paste` | fontSize | 15px | 16px |
| `paste` | color | rgb(93, 86, 75) | rgb(17, 17, 17) |
| `add` | rect x,y,w,h | [12, 644, 366, 48] | [12, 768.8, 366, 48] |
| `add` | backgroundColor | rgb(236, 226, 207) | rgb(255, 255, 255) |
| `add` | borderTopColor | rgba(90, 64, 20, 0.22) | rgb(213, 208, 198) |
| `add` | boxShadow | none | rgba(60, 40, 14, 0.06) 0px 10px 28px 0px |
| `add` | color | rgb(122, 79, 14) | rgb(163, 113, 31) |
| `q` | rect x,y,w,h | [12, 939, 366, 337] | [20, 834.8, 350, 296.7] |
| `qh` | rect x,y,w,h | [37, 960, 316, 36] | [33, 853.8, 324, 20.8] |
| `qlabel` | rect x,y,w,h | [37, 963, 64.6, 30] | [33, 853.8, 43.1, 20.8] |
| `qlabel` | fontSize | 19px | 13px |
| `qlabel` | fontWeight | 600 | 400 |
| `qlabel` | color | rgb(29, 25, 18) | rgb(92, 88, 82) |
| `qlist` | rect x,y,w,h | [13, 996, 364, 268] | [33, 886.6, 324, 229.9] |
| `row1` | rect x,y,w,h | [27, 1000, 336, 84] | [37, 894.6, 312, 73.3] |
| `row1` | backgroundColor | rgb(241, 228, 200) | rgba(0, 0, 0, 0) |
| `row1` | borderRadius | 10px | 0px |
| `row1` | borderTopColor | rgba(217, 168, 92, 0.35) | rgb(17, 17, 17) |
| `row2` | rect x,y,w,h | [27, 1084, 336, 84] | [37, 967.9, 312, 74.3] |
| `row2` | borderTopColor | rgb(29, 25, 18) | rgba(0, 0, 0, 0) |
| `disc1` | rect x,y,w,h | [38, 1016, 52, 52] | [69, 909.2, 44, 44] |
| `disc1` | boxShadow | none | rgba(176, 128, 52, 0.5) 0px 0px 0px 1.5px, rgba(201, 151, 63, 0.11) 0px 0px 0px 4px, rgba(150, 104, 36, 0.3) 0px 8px 20px 0px |
| `title1` | rect x,y,w,h | [102, 1008, 174, 68] | [123, 908.6, 140, 22.5] |
| `title1` | fontSize | 16px | 15px |
| `title1` | fontWeight | 400 | 600 |
| `title1` | lineHeight | 21px | 22.5px |
| `title1` | color | rgb(29, 25, 18) | rgb(154, 107, 34) |
| `sub1` | rect x,y,w,h | [102, 1054, 174, 22] | [123, 933.1, 140, 20.8] |
| `sub1` | lineHeight | 21px | 20.8px |
| `sub1` | color | rgb(93, 86, 75) | rgb(92, 88, 82) |
| `adder1` | rect x,y,w,h | [282, 1025, 34, 34] | [273, 919.2, 24, 24] |
| `adder1` | borderRadius | 0px | 999px |
| `del1` | rect x,y,w,h | [316, 1020, 44, 44] | [301, 909.2, 44, 44] |
| `del1` | borderRadius | 0px | 10px |
| `grip1` | visibility | hidden in mock (display:none) | visible [37, 909.2, 22, 44] |
| `now1` | rect x,y,w,h | [102, 1055, 60.5, 21] | [123, 934, 59.5, 19.2] |
| `now1` | fontSize | 13px | 12px |
| `now1` | lineHeight | 21px | 19.2px |
| `now1` | letterSpacing | normal | 0.48px |
| `now1` | color | rgb(122, 79, 14) | rgb(154, 107, 34) |
| `foot` | rect x,y,w,h | [0, 1063, 390, 129] | [0, 1147.5, 390, 84.2] |
| `foot` | backgroundColor | rgba(0, 0, 0, 0) | color(srgb 0.968627 0.964706 0.952941 / 0.88) |
| `foot` | borderTopColor | rgba(90, 64, 20, 0.22) | rgb(230, 226, 218) |
| `foot` | fontSize | 14px | 13px |
| `foot` | color | rgb(93, 86, 75) | rgb(92, 88, 82) |
| `hdr` | rect x,y,w,h | [0, 0, 390, 56] | [0, 0, 390, 57] |
| `hdr` | backgroundColor | rgba(0, 0, 0, 0) | color(srgb 0.968627 0.964706 0.952941 / 0.82) |
