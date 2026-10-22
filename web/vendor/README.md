# Vendored dependency and upstream review

`d3.min.js` is D3 7.9.0, © 2010–2023 Mike Bostock, ISC license in
`D3-LICENSE`. The unmodified bundle was obtained from the inspected upstream
repository below. No CDN, network fetch, npm install or build is required to run
the wallpaper.

Before implementation, Obsidian Live Wallpaper was cloned outside the vault to
`C:/Users/cemil/Development/hafiza-duvar-kagidi-upstream` and reviewed at commit
`c1bea029c826487594436765c6448985636bd8d3` (package 1.2.0):
https://github.com/william-ricchiuti/obsidian-live-wallpaper/tree/c1bea029c826487594436765c6448985636bd8d3

Its project license is MIT, © 2026 William Ricchiuti. The upstream MIT code was
not copied into this prototype. The renderer and worker here are new code; D3
is a separately licensed dependency and keeps its own notice.

Inspected sources: LICENSE, package.json, parser.js, worker.js, layout-core.js,
renderer-core.js and index.html.

Findings:

- The upstream worker is reusable: it runs D3 ticks off the main thread and stops
  below alpha 0.02 for 30 ticks; transferable position arrays avoid deep clones.
- Its full renderer offers themes, persistent animation, note overlays and many
  interactions beyond this prototype's scope. Copying it would bring considerable
  unrelated code; a compact cached Canvas scene is easier to verify for idle work.
- Its parser's wikilink extraction and basename resolution are not Obsidian's
  MetadataCache. The server also has note excerpt/text functionality. These pieces
  were not reused because this project exports only metadata and must follow
  Obsidian's actual resolved links.
- The small dedicated worker here retains the general worker/stop architecture,
  but implements a simpler finite force simulation. Once settled, the worker
  schedules no timers and the scene schedules no animation frames.

Review is source inspection, not an upstream installation or upstream correctness
claim. Prototype browser tests and machine integration evidence are recorded
separately in runtime/acceptance and the development README.
