'use strict';

const fs = require('node:fs');
const path = require('node:path');

class Watcher {
  constructor({ ignore, timeout = 1000 } = {}) {
    const { paths = [], files = [], exts = [] } = ignore;
    this.watchers = new Map();
    this.ignoredExts = new Set(exts);
    this.ignoredPaths = new Set(paths);
    this.ignoredFiles = new Set(files);
    this.events = {};
    this.timeout = timeout;
    this.timer = null;
    this.queue = new Map();
  }

  emit(name, ...args) {
    const events = this.events[name] || [];
    for (const listener of events) {
      setTimeout(listener, 0, ...args);
    }
  }

  on(name, listener) {
    const events = this.events[name];
    if (events) events.push(listener);
    else this.events[name] = [listener];
  }

  post(event, filePath) {
    if (this.timer) clearTimeout(this.timer);
    this.queue.set(filePath, event);
    if (this.timeout === 0) return void this.sendQueue();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.sendQueue();
    }, this.timeout);
  }

  sendQueue() {
    if (this.queue.size === 0) return;
    const queue = [...this.queue.entries()];
    this.queue.clear();
    this.emit('before', queue);
    for (const [filePath, event] of queue) {
      this.emit(event, filePath);
    }
    this.emit('after', queue);
  }

  watchDir(dirPath) {
    if (this.watchers.has(dirPath)) return;
    const watcher = fs.watch(dirPath);
    watcher.on('error', () => void this.unwatch(dirPath));
    watcher.on('change', (event, fileName) => {
      const target = dirPath.endsWith(path.sep + fileName);
      const filePath = target ? dirPath : path.join(dirPath, fileName);
      const isIgnoredFile = this.fileHandler(filePath);
      if (isIgnoredFile) return;
      fs.stat(filePath, (err, stats) => {
        if (err) {
          this.unwatch(filePath);
          return this.post('unlink', filePath);
        }
        if (stats.isDirectory()) this.watch(filePath);
        this.post('change', filePath);
      });
    });
    this.watchers.set(dirPath, watcher);
  }

  fileHandler(filePath) {
    const { ignoredExts, ignoredFiles } = this;
    const { ext, base, name } = path.parse(filePath);
    if (ignoredExts.has(ext) || ignoredExts.has(ext.slice(1))) return true;
    if (ignoredFiles.has(name) || ignoredFiles.has(base)) return true;
    return false;
  }

  directoryHandler(dirPath) {
    const { ignoredPaths } = this;
    const dirName = path.basename(dirPath);
    if (ignoredPaths.has(dirName) || ignoredPaths.has(dirPath)) return true;
    return false;
  }

  unwatch(filePath) {
    const watcher = this.watchers.get(filePath);
    if (!watcher) return;
    watcher.close();
    this.watchers.delete(filePath);
  }

  watch(targetPath = process.cwd()) {
    const options = { withFileTypes: true };
    const isIgnored = this.directoryHandler(targetPath);
    if (isIgnored) return this;
    fs.readdir(targetPath, options, (err, files) => {
      if (err) return this;
      for (const file of files) {
        if (!file.isDirectory()) continue;
        const dirPath = path.join(targetPath, file.name);
        this.watch(dirPath);
      }
      this.watchDir(targetPath);
    });
    return this;
  }

  stop(filePath) {
    if (!filePath) {
      for (const [filePath] of this.watchers) this.unwatch(filePath);
      return void this.watchers.clear();
    }
    if (!this.watchers.has(filePath)) return;
    this.watchers.delete(filePath);
    this.unwatch(filePath);
  }
}

module.exports = Watcher;
