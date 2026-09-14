# CSS Abstract Thumbnail Generator

## Summary
- Build a CSS-only abstract thumbnail system for `apps/site` that matches the reference quality using layered gradients, masks, blur, glow, and sheen; no SVG, canvas, or image assets.
- Create a reusable plan of record for implementing seeded abstract thumbnails across research and blog surfaces.

## Public API
- Add `getAbstractThumbnailConfig(seed, options?)` in the site libs layer. Inputs: `seed`, optional `family` (`"contour" | "stack" | "eclipse"`), optional `surface` (`"blog-card" | "blog-hero" | "research-lead"`). Output: a deterministic CSS-variable map plus the resolved family.
- Add `<AbstractThumbnail seed family? surface? className? />` in the site components layer. It owns the fixed layer markup and applies the helper output.
- Add namespaced CSS component classes in `apps/site/src/app/globals.css` for the shell, glow, band, orb, shadow, and sheen layers. Use Tailwind v4-compatible component classes and arbitrary values; do not add a Tailwind plugin.

## Implementation Changes
- Replace the page-local `ResearchLeadArtwork` SVG in `apps/site/src/app/research/page.jsx` with `AbstractThumbnail`, preserving the current layout and aspect ratio.
- Replace blog list covers and blog post hero figures in the blog routes with generated thumbnails everywhere. Remove the Unsplash caption UI from the post page, but leave existing `imageUrl` and attribution frontmatter fields untouched for compatibility.
- Seed thumbnails from stable content identifiers (`slug` first, title fallback) so output is identical across builds and server renders.
- Auto-rotate among three seeded families to cover the reference looks: layered contour waves, stacked soft bands, and horizon/orb compositions. Drive palette stops, glow position, band depth, and highlight strength through CSS variables so seeds feel distinct without drifting off-brand.

## Test Plan
- Verify determinism: repeated renders of the same seed resolve to the same family and CSS-variable set.
- Verify responsive rendering on `/research`, `/blog`, and `/blog/[slug]`: correct aspect ratios, clipped corners, no layer bleed, no visible seams, and no layout shift.
- Run `yarn workspace site build` and do a manual visual pass on the three surfaces for polish, depth, and readability.

## Assumptions
- CSS-only is a hard constraint, so the existing SVG research artwork is removed rather than retained as a fallback.
- The first version stays inside `apps/site`; no extraction to shared packages or dashboard usage.
- Blog rendering switches fully to generated artwork, while old content image metadata remains in markdown until a later cleanup.
