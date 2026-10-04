# Test fixtures

Real photos for the size-targeting tests. All three are **public domain** works of the US
National Park Service, taken from Wikimedia Commons. They were resized to at most 1200 px on
the longest side and re-encoded with mozjpeg (quality 88), which removed all metadata. They
contain no people and no personal data.

| File | Size | Source | Author / credit | License |
| --- | --- | --- | --- | --- |
| `landscape.jpg` | 1200 × 798 | [Upper and lower Yosemite falls](https://commons.wikimedia.org/wiki/File:Upper_and_lower_Yosemite_falls._NPS-Damon_Joyce_(18657762676).jpg) | NPS / Damon Joyce | Public domain (US federal government work) |
| `flowers.jpg` | 1200 × 900 | [Trillium flowers bloom in spring](https://commons.wikimedia.org/wiki/File:Trillium_flowers_bloom_in_spring._(018d89761c4747739144665e5eff00a8).JPG) | NPS staff, NPGallery | Public domain (US federal government work) |
| `portrait.jpg` | 756 × 1200 | [Vivid red beebalm flowers](https://commons.wikimedia.org/wiki/File:Vivid_red_beebalm_flowers_(Monarda_didyma)_can_be_found_blooming_along_Clingmans_Dome_Road_from_August_through_September._(26651e01-1dd8-b71c-07c7-c2e9e37a146e).jpg) | NPS photo, NPGallery | Public domain (US federal government work) |

## HEIC (ADR 0022)

| File | Size | Source | License |
| --- | --- | --- | --- |
| `iphone-grid.heic` | 4032 × 3024, shown 3024 × 4032 | Photo of a neutral subject taken on an iPhone 13 by the Mochifile maintainer: a real iPhone grid image (61 HEVC tiles in two grids, the photo and its HDR gain map), rotated with `irot` | CC0 1.0, released by the maintainer |
| `synthetic.heic` | 400 × 300 | The test suite's synthetic image, written by macOS `sips` | Generated for this project, no rights claimed (CC0) |
| `synthetic-alpha.heic` | 400 × 300 | The same with a transparent left half (an alpha auxiliary image) | Generated for this project, no rights claimed (CC0) |

The iPhone photo kept its location in EXIF even with location services off. Its EXIF item
(GPS, device, software, capture times, lens and MakerNote) was blanked in place, without
re-encoding: the file has the same length and layout, every changed byte is inside the old EXIF
item, and the decoded photo, HDR gain map and thumbnail are pixel-identical to the original.
Apple's ImageIO now reports only the orientation and tile size. Check any new photo the same
way before committing it.

Everything else the tests need is generated in code at test time (`src/testing/`): PNG and
WebP versions of these photos, images with transparency, JPEGs with EXIF orientation and fake
location metadata, and large images. Never add personal photos here.
