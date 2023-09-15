'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const DEBOUNCE_INTERVAL = 1000;

class Watcher {
  constructor({ ignore = {}, timeout = 0 } = {}) {
    const { dirs = [], files = [], exts = [] } = ignore;
    this.watchers = new Map();
    this.ignoredExts = new Set(exts);
    this.ignoredPaths = new Set(dirs);
    this.ignoredFiles = new Set(files);
    this.timeout = timeout + DEBOUNCE_INTERVAL;
    this.timer = null;
    this.queue = new Map();
    this.ee = new EventEmitter();
  }

  _checkIsIgnoredFile(filePath) {
    const { ignoredExts, ignoredFiles } = this;
    const { ext, base, name } = path.parse(filePath);
    if (ignoredExts.has(ext) || ignoredExts.has(ext.slice(1))) return true;
    if (ignoredFiles.has(name) || ignoredFiles.has(base)) return true;
    return false;
  }

  _checkIsIgnoredDir(dirPath) {
    const { ignoredPaths } = this;
    const dirName = path.basename(dirPath);
    if (ignoredPaths.has(dirName) || ignoredPaths.has(dirPath)) return true;
    return false;
  }

  _post(event, filePath) {
    if (this.timer) clearTimeout(this.timer);
    this.queue.set(filePath, event);
    this.timer = setTimeout(() => {
      this.timer = null;
      this._sendQueue();
    }, this.timeout);
  }

  _sendQueue() {
    if (this.queue.size === 0) return;
    const queue = [...this.queue.entries()];
    this.queue.clear();
    this.ee.emit('before', queue);
    for (const [filePath, event] of queue) {
      this.ee.emit(event, filePath);
    }
    this.ee.emit('after', queue);
  }

  _watchDir(dirPath) {
    if (this.watchers.has(dirPath)) return;
    const watcher = fs.watch(dirPath);
    watcher.on('error', () => void this.unwatch(dirPath));
    watcher.on('change', (_, fileName) => {
      const target = dirPath.endsWith(path.sep + fileName);
      const filePath = target ? dirPath : path.join(dirPath, fileName);
      if (this._checkIsIgnoredFile(filePath)) return;
      this._post('*', filePath);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          const keys = [...this.watchers.keys()];
          const event = keys.includes(filePath) ? 'unlinkDir' : 'unlink';
          this._post(event, filePath);
          return void this.unwatch(filePath);
        }
        if (stats.isDirectory()) this.watch(filePath);
        this._post('change', filePath);
      });
    });
    this.watchers.set(dirPath, watcher);
  }

  on(name, listener) {
    this.ee.on(name, listener);
  }

  unwatch(filePath) {
    const watcher = this.watchers.get(filePath);
    if (!watcher) return;
    watcher.close();
    this.watchers.delete(filePath);
  }

  watch(targetPath = process.cwd()) {
    const options = { withFileTypes: true };
    if (this._checkIsIgnoredDir(targetPath)) return this;
    fs.readdir(targetPath, options, (err, files) => {
      if (err) return this;
      for (const file of files) {
        if (!file.isDirectory()) continue;
        const dirPath = path.join(targetPath, file.name);
        this.watch(dirPath);
      }
      this._watchDir(targetPath);
    });
    return this;
  }

  stop(filePath) {
    if (filePath) return void this.unwatch(filePath);
    for (const [filePath] of this.watchers) this.unwatch(filePath);
  }
}

module.exports = Watcher;
