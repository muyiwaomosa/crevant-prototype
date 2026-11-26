# Video device test (founder or testers, about half a day)

Video posts stay **off** until this test passes. The switch in the Control
Center refuses to turn them on before then. Everything else in Splitpost works
without video.

**When:** once the video pull request is merged and deployed to staging (Claude
will say when). The test page is `/app/video-test` on the staging app.
Nothing you record is published: test uploads stay private and are deleted
after 24 hours.

## What you need

* An iPhone (any iOS 18 or newer) with Safari.
* An Android phone (Samsung or Pixel) with Chrome.
* One computer with Chrome (Windows or Mac).
* Wi-Fi, and once on each phone, mobile data (4G or 5G).

## On each phone (about 20 minutes per phone)

Open the staging app, sign in, go to `/app/video-test`.

| # | Do | Write down |
|---|---|---|
| 1 | Record a **1 minute** video with the phone's camera app (just film the room and talk) | Nothing yet |
| 2 | Record a **5 minute** video the same way | Nothing yet |
| 3 | On the test page, **Choose a video**, pick the 1 minute clip | Did the picker open your Photos or Gallery? (yes or no) |
| 4 | Wait for **Check, Convert, Upload** to finish (keep the page open) | The times the page shows (Check, Convert, Upload and the server check), and the result line (Pass, or the message) |
| 5 | Press **Play the uploaded clip**, then play it | Did it play with sound? |
| 6 | Repeat 3 to 5 with the **5 minute** clip | The same, plus: did the screen lock during conversion? If so, what happened when you unlocked it? |
| 7 | Turn Wi-Fi off and repeat 3 to 5 with the 1 minute clip on mobile data | Upload time |
| 8 | **Android only:** in the camera settings choose "High efficiency" or "HEVC" if offered, record 30 seconds, and repeat 3 to 5 | The result line |

The page shows a summary box at the end (the device, each clip's times and
result). Press **Copy results** and paste it into Splitpost Feedback
(category: Problem, feature: Create) or send it to Claude. That is all Claude
needs; no screenshots required.

## On the computer (about 10 minutes)

1. On `/app/video-test`, upload one `.MOV` (from the iPhone, via AirDrop or a
   cable) and one `.MP4` (from the Android phone).
2. Play both, and play one of the phone uploads.
3. Copy results as above.

## What counts as a pass

| Device | Must work |
|---|---|
| iPhone Safari | 1 and 5 minute clips check, convert (or pass through), upload and play |
| Android Chrome | The same, including the HEVC clip (converted, or a clear message explaining how to export H.264) |
| Computer | .MOV and .MP4 upload and play |

## Recording the result and turning video on

In the Control Center, **Video posts**:

1. For each device, choose it, choose Passed or Did not pass, paste the copied
   results into Notes and press **Record result**. Results are kept and can't
   be edited; record again if you test again (the latest one counts).
2. Set the **Video storage cap** (50 GB proposed for the pilot) and press
   **Save cap**.
3. Once the latest iPhone Safari and Android Chrome results both passed and the
   cap is set, **Turn new video uploads on** in Operational switches becomes
   available (with a reason, as for every switch).

Three separate controls, each recorded with its reason:

* **New video uploads** pauses new uploads and video posts. Videos already
  published keep playing.
* **Video playback** stops playback of published videos (for bandwidth),
  without touching uploads.
* **Stop all video now** (in the Video posts panel) turns both off at once.

Before the test, the staging project's Storage upload size limit must be at
least 110 MB (Supabase dashboard, Storage settings). Done Nov 26 (founder),
after staging moved to the Pro plan (the Free plan caps it at 50 MB). The
5-minute clip confirms it in practice: a lower limit shows as a clear upload
error.

If the iPhone cannot finish the 5 minute conversion reliably, Claude applies the
agreed fallback (SP-VID-001, section 6: accept iPhone H.264 up to 1080p as
delivered by iOS, with a larger size cap) and asks you before turning video on.
