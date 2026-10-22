'use strict';
const { Plugin, Notice } = require('obsidian');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

module.exports = class HafizaWallpaperPlugin extends Plugin {
  onload() {
    this.pluginDir = fs.realpathSync(path.join(this.app.vault.adapter.getBasePath(), this.manifest.dir));
    this.buildSnapshot = require(path.join(this.pluginDir, 'metadata.js')).buildSnapshot;
    this.stopped = false;
    this.timer = null;
    this.pending = false;
    this.inFlight = false;
    this.lastSignature = null;
    this.retryTimer = null;
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.schedule()));
    this.registerEvent(this.app.metadataCache.on('resolve', () => this.schedule()));
    for (const event of ['rename', 'delete', 'create']) {
      this.registerEvent(this.app.vault.on(event, () => this.schedule()));
    }
    this.addCommand({ id: 'export-link-metadata', name: 'Export graph metadata now', callback: () => this.publish(true) });
    this.app.workspace.onLayoutReady(() => this.schedule());
  }
  schedule() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.publish(), 700);
  }
  readConfig() {
    // realpath follows the junction; configuration and token stay outside the vault.
    const dir = this.pluginDir;
    const config = JSON.parse(fs.readFileSync(path.join(dir, '..', 'runtime', 'config.json'), 'utf8'));
    const endpoint = new URL(config.endpoint || `http://127.0.0.1:${config.port || 47831}/api/snapshot`);
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.pathname !== '/api/snapshot') {
      throw new Error('Bridge must be the local loopback /api/snapshot endpoint');
    }
    if (typeof config.token !== 'string' || config.token.length < 24) throw new Error('Missing bridge token');
    return { endpoint, token: config.token };
  }
  async publish(force = false) {
    if (this.stopped) return;
    if (this.inFlight) { this.pending = true; return; }
    this.inFlight = true;
    try {
      const config = this.readConfig();
      const snapshot = this.buildSnapshot(this.app);
      const signature = JSON.stringify([snapshot.nodes, snapshot.edges]);
      if (!force && signature === this.lastSignature) return;
      const body = JSON.stringify(snapshot);
      await new Promise((resolve, reject) => {
        const req = http.request(config.endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: 'Bearer ' + config.token }
        }, res => { res.resume(); res.on('end', () => res.statusCode === 200 ? resolve() : reject(new Error('Bridge HTTP ' + res.statusCode))); });
        this.request = req;
        req.setTimeout(5000, () => req.destroy(new Error('Bridge timeout')));
        req.on('error', reject);
        req.end(body);
      });
      this.lastSignature = signature;
      this.lastExport = { generatedAt: snapshot.generatedAt, nodes: snapshot.nodes.length, edges: snapshot.edges.length };
      this.lastError = null;
      clearTimeout(this.retryTimer);
    } catch (error) {
      this.lastError = String(error.message || error);
      // Retry only while unavailable; no periodic disk/metadata scan when idle.
      clearTimeout(this.retryTimer);
      if (!this.stopped) this.retryTimer = setTimeout(() => this.publish(), 10000);
      if (force) new Notice('Hafıza bridge: ' + this.lastError);
    } finally {
      this.inFlight = false;
      this.request = null;
      if (this.pending && !this.stopped) { this.pending = false; this.schedule(); }
    }
  }
  onunload() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.retryTimer);
    this.request?.destroy();
  }
};
