# Avatar test images (TEST ONLY)

Made with jpeg-js 0.4.4 in a scratch folder, for scripts/e2e/avatar-edge.sh:

| File | What it is | Expected |
|---|---|---|
| good.jpg | a valid 512 x 512 JPEG | accepted |
| exif.jpg | good.jpg with an EXIF segment carrying "GPS" text | accepted; stored copy has no EXIF |
| polyglot.jpg | good.jpg with HTML appended after the image | accepted; stored copy has no HTML |
| html.jpg | HTML, named .jpg | refused (not a JPEG) |
| truncated.jpg | the first half of good.jpg | refused (not decodable) |
| bomb.jpg | good.jpg with a header claiming 30,000 x 30,000 | refused before decoding |
| small.jpg | a valid 64 x 64 JPEG | refused (must be 512 x 512) |
