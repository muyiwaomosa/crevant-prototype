# jpeg-js 0.4.4 (vendored)

A second, byte-identical copy of `supabase/functions/avatar/vendor/jpeg-js-0.4.4`
(left untouched), used by the post-media Edge Function to fully decode and
re-encode every post photo on the server (`../../post-media/image.ts`).
Both copies are pinned to the same upstream hashes by tests. Vendored so nothing is downloaded at
deploy or run time, and so the exact code is reviewed here.

* Source: the npm package `jpeg-js@0.4.4` (published 2022-06-07), tarball
  integrity `sha512-WZzeDOEtTOBK4Mdsar0IqEU5sMr3vSV2RqkAIzUEV2BHnUfKGyswWFPFwK5EeDo93K3FohSHbLAjj0s1Wzd+dg==`
  (matches the registry's published integrity).
* Licence: BSD-3-Clause (`LICENSE`, unchanged).
* Files: `lib/decoder.js` and `lib/encoder.js`, byte for byte, with ONE line
  appended to each (`export { decode }` / `export { encode }`) so they load as
  ES modules. Nothing else is changed; `scripts/avatar-function.test.mjs`
  checks that the files without that line still match the upstream SHA-256:
  * decoder.js `a3f175fd6f62d142aad94d3bd90f3a30be4e076baf9b6a6fa31c8e84d9d4aa9f`
  * encoder.js `00bde8df2517eca556669ab6fc27b414e9ba3fc52a0a71e1e37ec7c5f19c3d34`
* Advisories: none open for 0.4.4. GHSA-xvf7-4v9q-58w6 (infinite loop) is
  fixed in 0.4.4; the 2020 resource-consumption issue is fixed since 0.4.0 by
  the `maxResolutionInMP` / `maxMemoryUsageInMB` limits, which `image.ts`
  always sets (1 megapixel, 64 MB), after first checking the header is exactly
  512 x 512.
* To update: replace both files from a newer reviewed release, append the same
  line, update the hashes here and in the test, and re-run the function tests.
