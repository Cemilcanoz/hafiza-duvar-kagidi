'use strict';
const path = require('node:path').posix;

// Obsidian already resolves aliases, wikilinks, Markdown links and duplicate names.
// We never parse Markdown and never read a note body.
function unresolvedId(source, raw) {
  let target = raw.replace(/\\/g, '/').replace(/\.md$/i, '');
  if (target.startsWith('./') || target.startsWith('../')) {
    target = path.normalize(path.join(path.dirname(source), target));
  } else target = target.replace(/^\/+/, '');
  return 'unresolved:' + target;
}

function buildSnapshot(app, now = new Date()) {
  const files = app.vault.getMarkdownFiles();
  const nodes = new Map(files.map(file => [file.path, { id: file.path, label: file.basename }]));
  const edges = new Map();
  const addEdge = (source, target, count) => {
    if (!Number.isSafeInteger(count) || count < 1) return;
    const key = JSON.stringify([source, target]);
    const previous = edges.get(key);
    if (previous) previous.count += count;
    else edges.set(key, { source, target, count });
  };
  for (const [source, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
    if (!nodes.has(source)) continue;
    for (const [target, count] of Object.entries(targets)) {
      // The current Obsidian graph has attachments disabled; exclude them here too.
      if (nodes.has(target)) addEdge(source, target, count);
    }
  }
  for (const [source, targets] of Object.entries(app.metadataCache.unresolvedLinks)) {
    if (!nodes.has(source)) continue;
    for (const [raw, count] of Object.entries(targets)) {
      if (!Number.isSafeInteger(count) || count < 1) continue;
      const id = unresolvedId(source, raw);
      if (!nodes.has(id)) nodes.set(id, { id, label: raw, unresolved: true });
      addEdge(source, id, count);
    }
  }
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  return {
    schema: 1,
    generatedAt: now.toISOString(),
    nodes: [...nodes.values()].sort((a, b) => compare(a.id, b.id)),
    edges: [...edges.values()].sort((a, b) => compare(a.source, b.source) || compare(a.target, b.target))
  };
}
module.exports = { buildSnapshot, unresolvedId };
