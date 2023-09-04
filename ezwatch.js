'use strict';

const fs = require('node:fs');
const path = require('node:path');

class Watcher {
  constructor(options = {}) {
    const { ignoredPaths = [], ignoredFiles = [], ignoredExts = [] } = options;
    this.watchers = new Map();
    this.ignoredExts = new Set(ignoredExts);
    this.ignoredPaths = new Set(ignoredPaths);
    this.ignoredFiles = new Set(ignoredFiles);
    this.events = {};
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

  _change(filePath) {
    this.emit('change', filePath);
  }

  _rename(filePath) {
    fs.access(filePath, (err) => {
      if (err) {
        this.emit('delete', filePath);
      } else {
        this.emit('rename', filePath);
        setTimeout(() => {
          this._watchFile(filePath);
        }, 0);
      }
      this.unwatch(filePath);
    });
  }

  _watchFile(filePath) {
    const watcher = fs.watch(filePath, (event) => {
      if (event === 'rename') this._rename(filePath);
      if (event === 'change') this._change(filePath);
    });
    watcher.on('error', () => void this.watchers.delete(filePath));
    this.watchers.set(filePath, watcher);
  }

  _fileHandler(filePath) {
    const { ignoredExts, ignoredFiles } = this;
    const { ext, base, name } = path.parse(filePath);
    if (ignoredExts.has(ext) || ignoredExts.has(ext.slice(1))) return;
    if (ignoredFiles.has(name) || ignoredFiles.has(base)) return;
    this._watchFile(filePath);
  }

  _directoryHandler(dirPath) {
    const { ignoredPaths } = this;
    const dirName = path.basename(dirPath);
    if (ignoredPaths.has(dirName) || ignoredPaths.has(dirPath)) return;
    this.watch(dirPath);
  }

  _mainHandler(filePath) {
    fs.stat(filePath, (err, stats) => {
      if (err) return;
      if (stats.isDirectory()) this._directoryHandler(filePath);
      if (stats.isFile()) this._fileHandler(filePath);
    });
  }

  unwatch(filePath) {
    const watcher = this.watchers.get(filePath);
    if (!watcher) return;
    watcher.close();
    this.watchers.delete(filePath);
  }

  watch(target) {
    const options = { withFileTypes: true };
    fs.readdir(target, options, (err, files) => {
      if (err) return this;
      for (const file of files) {
        const dirPath = path.join(target, file.name);
        this._mainHandler(dirPath);
      }
    });
    return this;
  }

  stop() {
    for (const [filePath] of this.watchers) this.unwatch(filePath);
  }
}

module.exports = Watcher;
