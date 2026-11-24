# SP-VID-001: Video publishing feasibility (5 minutes, 720p, H.264)

Status: assessment, November 24, 2026. Experiments only; no application code changed.
Related: `docs/MEDIA_PLAN.md` (earlier plan, 60 seconds), `docs/PHOTOS.md` (photo pipeline we reuse).

## 1. Question

Can Splitpost accept videos of up to five minutes, play them at up to 720p in H.264 on all supported browsers, and keep storage and bandwidth affordable, using only existing infrastructure (Vercel, Supabase Storage, Edge Functions)?

**Answer: yes, with one design choice.** Phones record far above 720p, so something must convert. Without a paid service, the conversion can run in the creator's browser (WebCodecs) before upload. This works in the experiment below. It must be confirmed on real iPhones and Android phones before we commit, and the plan keeps a fallback.

## 2. What phones actually produce

| Source | Typical result | Size of 5 minutes |
|---|---|---|
| iPhone default ("High Efficiency") | HEVC in .MOV, 1080p30 | about 300 to 325 MB |
| iPhone "Most Compatible" | H.264 in .MOV, 1080p30 | about 650 MB |
| iPhone 4K30 | HEVC or H.264 | about 850 MB to 1.9 GB |
| Recent Pixel (Pixel 10) | HEVC by default | similar to iPhone HEVC |
| Samsung | H.264 by default on many models, HEVC optional | about 650 MB at 1080p |
| Splitpost target: 720p30 H.264, 2.5 Mbps video, 128 kbps audio | MP4 | **about 99 MB** |

Sources: Apple camera settings text and support articles, Android press coverage (see research notes in SP-TA-001 section 11). Sizes vary by model and HDR.

**Important platform behaviour.** Since 2021 (WebKit change for bug 230639, refined in 2024), iOS Safari converts videos chosen from the Photos library to H.264 before giving them to the website, showing its own progress sheet. So most iPhone uploads arrive as H.264, but still at 1080p or 4K and at full size. Files picked through the Files app may arrive unconverted (HEVC). Android does no conversion.

## 3. Experiments run (Linux, headless Chromium 158 from the pre-installed Playwright)

Test files were generated with ffmpeg from a moving, noisy camera-like source: 1080p H.264 in .MOV at 17 Mbps (iPhone "Most Compatible" style), 1080p HEVC in .MOV (`hvc1`, iPhone style), 1080p HEVC in MP4 (`hev1`), 720p H.264 MP4 at 2.5 Mbps, and 720p H.264 MP4 at 4 Mbps with the index at the end of the file.

### 3.1 Format detection without new dependencies

A 90-line header reader (`docs/video/sniff-prototype.js`) identified codec, resolution, duration and audio codec for all five files by reading **about 25 KB** of each file, in Node and in the browser, including files whose index is at the end. Detection took 1 to 6 ms in the browser.

| File | Detected | Correct |
|---|---|---|
| 1080p H.264 .MOV | avc1, 1920×1080, 20 s, AAC | Yes |
| 1080p HEVC .MOV | hvc1, 1920×1080, 20 s, AAC | Yes |
| 1080p HEVC .MP4 | hev1, 1920×1080, 20 s, AAC | Yes |
| 720p H.264 .MP4 | avc1, 1280×720, 20 s, AAC | Yes |
| 720p H.264 .MP4, index at end | avc1, 1280×720, 20 s, AAC | Yes |

The same reader can run in the Edge Function on the first and last bytes of an uploaded file, so the server verifies codec, size and duration without downloading the whole video.

### 3.2 Playback

| File | `canPlayType` | Actual playback in Chromium |
|---|---|---|
| H.264 MP4 | "probably" | Plays (1280×720) |
| H.264 .MOV | "" (says no) | **Plays (1920×1080)** |
| HEVC .MOV / .MP4 | "" | **Fails silently**: audio loads, picture is 0×0, no error event |

Two consequences: we can accept H.264 in a .MOV container, and we cannot rely on the browser to report an unplayable file. Every upload must be checked by codec, not by the browser's error events.

### 3.3 In-browser conversion to 720p

Using the open-source library mediabunny (version 1.65.2, published November 4, 2026, MPL-2.0, about 760 KB minified, loaded only when a creator picks a video) on top of the browser's WebCodecs:

| Input | Result |
|---|---|
| 20 s 1080p H.264 .MOV, 44 MB | 720p H.264 MP4, 2.49 Mbps, AAC copied unchanged, **6.6 MB**, finished in 5.4 s (**3.7× real time**, software encoder, 4 CPU cores) |
| 20 s 1080p HEVC .MOV | This Chromium cannot decode HEVC, so the library dropped the video track ("undecodable_source_codec"). The app must treat this as a failure, never publish audio only |

At 3.7× real time a five-minute video converts in about 80 seconds on a desktop-class CPU without hardware acceleration. Phones use hardware encoders through WebCodecs, which are usually faster, but **no phone measurement exists yet**. iOS Safari's WebCodecs H.264 encoding is recent; support must be confirmed on the iOS versions our pilot participants use.

**Not testable here:** real iPhone and Android uploads, Safari, backgrounding behaviour (iOS may suspend a tab mid-conversion), battery and heat, and HEVC decoding on phones. These need a one-day device test (section 6).

## 4. Options compared

| Option | How it works | Pros | Cons | Effort | Running cost |
|---|---|---|---|---|---|
| **A. Native restriction only** | Accept only H.264 files already at or below 720p and the size cap | Simplest | Almost every phone video is 1080p or larger, so most creators are refused or must convert elsewhere. Poor first impression | 18 h | Lowest |
| **B. In-browser normalisation (recommended)** | Detect codec; if H.264 at 720p or less and within the bitrate, upload as is; otherwise convert to 720p H.264 in the browser, then upload with resumable signed upload | No new vendor, no new cost; consistent 720p files; predictable storage and bandwidth; iPhone Photos uploads are already H.264 | One new open-source dependency; conversion time on phones; tab must stay open; older devices may lack WebCodecs, so they get a clear message | 40 h | Same as A |
| **C. Creator-side guidance** | Tell creators how to record at 720p "Most Compatible" or export at 720p | No code | Friction; many will not follow it; not a substitute for B | 2 h (help text), included in B as the fallback message | Same |
| **D. Managed transcoding (Cloudflare Stream or Mux)** | Upload original to the vendor; it transcodes and streams adaptively | Handles every format including HEVC; adaptive streaming | New vendor, webhooks, keys and privacy review; about 2 extra days; not authorized without approval | 56 h | Stream: about $5 per 1,000 minutes stored and $1 per 1,000 minutes delivered (unconfirmed list prices) |

**Recommendation: B, with C as its fallback message, and D kept as a documented contingency** if the device test shows B fails on iPhones. D becomes cheaper than Supabase delivery only at around 10,000 active users (section 7).

## 5. Proposed implementation (Option B)

1. **Picker:** `accept="video/mp4,video/quicktime,video/*"`. iOS will convert Photos videos to H.264 itself.
2. **Check (instant, no upload):** header reader gives codec, size and duration. Refuse over five minutes with a clear message. HEVC from Android or Files: try to convert (works where the device can decode HEVC); if it can't, explain how to export H.264.
3. **Normalise:** if above 720p or above the bitrate limit, convert to 720p30 H.264 at about 2.5 Mbps with AAC audio, showing progress, time remaining and Cancel, and warning the creator to keep the page open. Keep the screen awake where supported.
4. **Upload:** resumable upload in 6 MB chunks to a private `post-videos` bucket using a signed upload token issued by the database (Supabase supports resumable uploads with signed upload URLs, so **no member storage policy is needed**), with automatic resume after network loss.
5. **Verify on the server:** an Edge Function reads the file header and confirms H.264, at most 1280×720, at most 300 s, within the size cap, before the post can be published; it also extracts a poster frame through the photo pipeline (or the browser uploads a poster image that goes through the existing photo checks).
6. **Play:** short-lived signed links (as photos), `preload="none"`, no autoplay, standard controls; horizontal swipe gestures are disabled over the player.
7. **Operate:** per-member daily count and storage quota, project storage cap, egress alerts at 50% and 80% of the included allowance, a founder pause switch, deletion through the existing media deletion queue.

New dependencies: mediabunny (MPL-2.0, pinned to a release at least two weeks old, lazy-loaded) and a small resumable-upload client (tus-js-client or the protocol implemented directly, decided in the spike). No new vendor, service or cost.

## 6. Device test before committing (one day, needs the founder or testers)

A test page on the staging preview that records, for each device: picker behaviour, codec received, conversion time for a 1, 3 and 5 minute clip, upload time on Wi-Fi and 4G, playback on other devices, and what happens when the screen locks.

| Device | Browser | Must pass |
|---|---|---|
| iPhone (iOS 18 and iOS 26) | Safari | Photos pick, convert or pass through, upload, play |
| Android (Samsung, Pixel) | Chrome | Same, including an HEVC recording |
| Windows, macOS | Chrome, Edge, Safari, Firefox | Upload of a .MOV and an .MP4; playback |

**Exit rule:** if iPhone Safari cannot complete a five-minute conversion reliably, we keep B for Android and desktop, accept iPhone H.264 uploads up to 1080p as delivered by iOS with a higher size cap (about 400 MB), and bring option D to the founder with costs.

## 7. Storage and bandwidth at 720p

At 2.5 Mbps a minute of video is about 19 MB. Assumptions: each active member watches 30 minutes of video a month; 10% of members create four videos a month averaging four minutes.

| Active members | Video delivered per month | Supabase egress cost (250 GB included, then $0.09/GB) | New storage per month |
|---|---|---|---|
| 100 | about 56 GB | $0 | about 3 GB |
| 1,000 | about 560 GB | about $28 | about 30 GB |
| 10,000 | about 5.6 TB | about $480 | about 300 GB (about $4 a month more each month) |

Without normalisation (iPhone 1080p H.264 at about 17 Mbps) the same viewing would cost about 7 times more.

## 8. Parameters to approve

| Parameter | Proposed value |
|---|---|
| Maximum duration | 5 minutes (as requested) |
| Output | 720p30 H.264, about 2.5 Mbps, AAC 128 kbps, MP4 |
| Maximum published file | 110 MB |
| Maximum source file for in-browser conversion | 2 GB |
| Videos per member per day | 5 |
| Storage per member | 1 GB |
| Project video storage cap (pilot) | 50 GB, configurable |
| Egress alerts | 50% and 80% of included allowance, pause switch at founder's discretion |
