# Metadata bridge

Original dependency-free CommonJS desktop Obsidian plugin. `main.js` is loaded by Obsidian; `metadata.js` contains the pure snapshot projection. No Markdown parser and no note-body read API is used.

Source API: https://raw.githubusercontent.com/obsidianmd/obsidian-api/master/obsidian.d.ts (`MetadataCache.resolvedLinks`, `unresolvedLinks`, `resolve`, `resolved`; `Vault.getMarkdownFiles`, `rename`, `delete`, `create`).

## Installation

Start the local bridge first so `../runtime/config.json` exists with `{ "port": 47831, "token": "..." }`. Keep that file private. Create the vault junction `.obsidian/plugins/hafiza-wallpaper` pointing to this external directory. Enable **Hafıza Duvar Kâğıdı Bridge** under Obsidian community plugins. All executable source and the authentication token remain outside the vault. To remove it, disable the plugin and remove only the junction, never recursively delete its target.

The initial full snapshot is sent after workspace layout readiness. Link resolution and vault create/rename/delete events schedule an update after a 700 ms debounce. Successful unchanged graphs do not resend or scan periodically. If the bridge is down, retries run every 10 seconds; the bridge retains its last valid snapshot independently.

The command **Export graph metadata now** forces an immediate export. Plugin instance diagnostics expose `lastExport` (date/counts) and `lastError`; neither contains note content or the token.

## Graph scope

Every Markdown file is a node, including orphans. Attachments and tags are excluded. Resolved edges and multiplicities come directly from the official cache; paths are full vault-relative `TFile.path`, so duplicate basenames remain separate. Unresolved nodes use an `unresolved:` namespace. Explicit relative unknown targets (`./`, `../`) include source folder context; bare unknown targets are shared. This last choice is our explicit visualization policy: the official cache does not publish canonical destination paths for nonexistent files. The prototype does not promise Obsidian GraphView filter or coordinate parity.

## Verification

`node tests/metadata-fixture.cjs` prepares a separate external fixture vault and Obsidian profile. Run that profile with `--user-data-dir=.../runtime/metadata-fixture-profile --remote-debugging-port=9224`; run the real vault temporarily at debug port 9223. `node tests/metadata-live.cjs` checks official cache behavior against exported nodes/edges, then writes `runtime/metadata-evidence.json`. It renames/deletes synthetic fixture notes only, never user notes. Reset the fixture generator before repeating the test. Close temporary debug profiles when finished.

Observed on 2026-10-21: actual Obsidian 1.14.4, isolated bundled fixture Obsidian 1.11.7; 274 actual Markdown files, 282 nodes, 568 directed edges. All 557 actual resolved Markdown edge pairs/counts matched the official cache exactly. Controlled live fixtures passed aliases, Markdown links, headings, Turkish paths, duplicate basenames, relative paths, unresolved targets, orphans, rename and delete.
