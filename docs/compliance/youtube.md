# YouTube compliance: rules and open gaps (Mulia)

Read this before changing the player, playback, or track metadata. It is a working summary, not legal advice.

- Rules last read: 2026-10-20 (Asia/Bangkok, UTC+7). Re-read the sources before a public launch, because the policies change.
- Code status checked on `wip/r46-ui-claude` @ `c46ead4` (2026-11-10).
- Labels: **[opinion]** means team inference; **[unverified]** means no source was found.

## 1. Scope
Embedding through the IFrame Player API needs no API key, but the YouTube API ToS and Developer Policies still apply. YouTube Help 171780 says: "The YouTube API Terms of Service and Developer Policies apply to all access and use of the YouTube embedded player."

## 2. Hard rules for the player (do not break these when changing the UI)
| Rule | Source | Status on `c46ead4` |
|---|---|---|
| Player viewport is at least 200×200 px and large enough to show its controls. 16:9 is a recommendation (at least 480×270), not a requirement. | RMF, *Embedded YouTube Player size* | OK. 363×204 (`vinyl.tsx` L88–89); QA measured 363×204.2. |
| No overlays, frames or other elements in front of any part of the player, and nothing that obscures it. That includes opacity tricks, clipping or `border-radius` crop, transforms, and z-index overlap. | RMF, *Overlays and frames*; Dev Policies III.I.4, III.I.6 | OK per QA (radius 0, no overlay or transform). Agreed exception: none. |
| No changes to the player that the API docs don't describe. | RMF, *Player attributes* | OK. Documented `playerVars` only. |
| Don't obscure YouTube's attribution or the links inside the player. | Dev Policies III.F.2.c, III.I.4 | OK. The player is visible with native controls. |
| Native controls are allowed and kept (`controls:1`, `fs:1`, `disablekb:0`). | Player Parameters | OK (`vinyl.tsx` L90–99). |
| Autoplay, including programmatic `playVideo`/`loadVideoById`, only when more than 50% of the player is visible. At most one autoplaying player per page. | RMF, *Autoplay and scripted playbacks* | Keep the player on screen on any device that plays. |
| Playback must be clearly started by the user and identifiable as a YouTube action. | Dev Policies III.C.2 | Grey area for a remote device starting the speaker **[opinion]**. Don't widen it. |
| Don't block, hide or interfere with YouTube ads. | Dev Policies III.I.5; Help 132596 | OK while the player stays visible. |
| Don't separate or isolate the audio from the video. | Dev Policies III.I.7, III.I.8 | Keep the video visible; don't market the app as audio-only. |
| Pages showing YouTube content must make clear that YouTube is the source. | Dev Policies III.F.2.a; Branding Guidelines | Attribution is present per QA. The official "developed with YouTube" badge was not verified **[unverified]**. |
| Link to the YouTube ToS, plus a privacy policy that names YouTube API Services, links the Google Privacy Policy and covers cookies. | Dev Policies III.A.1, III.A.2; API ToS §7 | Present: `src/app/terms`, `src/app/privacy`, and `room-footer.tsx`. Wording not legally reviewed. |
| Identify the client with the HTTP `Referer` header; don't suppress it. | RMF, *Client identity* | OK. `origin` is passed and no restrictive Referrer-Policy is set. |
| Don't download or cache audiovisual content. | Dev Policies III.E.1; YouTube ToS | OK. Streams only through the player. |
| Personal, non-commercial use only: no public screening or venue music. | YouTube ToS restriction 9 | Applies to how the app is promoted. |

## 3. Open gaps (must close before a public launch)
1. **III.I.9 background player.** The rule bans playing content from "a player that is not displayed in the page, tab, or screen that the user is viewing". Mulia keeps playing when the tab is hidden (long-poll and wake lock in `room-stage.tsx`). **The owner chose to keep this behaviour, which is acceptable for private use only.** Do not remove it without the owner's decision, and do not ship it publicly as it is.
2. **III.E.4.j Made-for-Kids.** The rule says: "API Clients must look up the Made For Kids status of each YouTube video that it embeds". This is **not implemented.** The documented route is Data API v3 `videos.list` with `part=status`, reading `status.madeForKids`. That needs an API key and a Google Cloud project.
3. **III.E.4.d–f 30-day data.** Stored title, author, thumbnail URL and duration count as API data. They must be refreshed or deleted within 30 days, and shown data must be the latest. On `c46ead4` I found no time-based purge or refresh: only the played-history cap of 100 (`rooms.ts` ~L752) and room deletion. Treat as **open**.
4. **oEmbed.** The `youtube.com/oembed` endpoint is public, but I found no YouTube developer doc for it (III.D.7 requires documented APIs) **[unverified]**. Low risk. Data API `videos.list` is the documented alternative and would also cover the MFK lookup and duration.

## 4. Sources (read 2026-10-20)
- Developer Policies, last updated 2026-10-15: https://developers.google.com/youtube/terms/developer-policies
- Required Minimum Functionality (RMF), last updated 2026-10-15: https://developers.google.com/youtube/terms/required-minimum-functionality
- API Services ToS, last updated 2026-09-14: https://developers.google.com/youtube/terms/api-services-terms-of-service
- Compliance guide, last updated 2026-09-14: https://developers.google.com/youtube/terms/developer-policies-guide
- IFrame Player API, last updated 2026-10-15: https://developers.google.com/youtube/iframe_api_reference
- Player parameters, last updated 2026-10-15: https://developers.google.com/youtube/player_parameters
- Branding Guidelines, last updated 2025-08-20 (not read in full): https://developers.google.com/youtube/terms/branding-guidelines
- YouTube ToS, effective 2023-12-15: https://www.youtube.com/t/terms
- Help 171780, Embed videos (no date shown): https://support.google.com/youtube/answer/171780
- Help 132596, Ads on embedded videos (no date shown): https://support.google.com/youtube/answer/132596
