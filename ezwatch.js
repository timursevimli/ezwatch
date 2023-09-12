'use strict';

const fs = require('node:fs');
const path = require('node:path');

class Watcher {
  constructor({ ignore } = {}) {
    const { paths = [], files = [], exts = [] } = ignore;
    this.watchers = new Map();
    this.ignoredExts = new Set(exts);
    this.ignoredPaths = new Set(paths);
    this.ignoredFiles = new Set(files);
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

  checkPath(dir, targetPath, filePath) {
    fs.readdir(dir, (err, files) => {
      if (err) return;
      const paths = files.map((file) => path.join(dir, file));
      if (paths.includes(targetPath)) this.watchFile(targetPath);
      if (paths.includes(filePath)) return void this.fileHandler(filePath);
      if (paths.includes(targetPath)) this.emit('rename', filePath, targetPath);
      this.emit('unlink', filePath);
    });
  }

  watchFile(targetPath) {
    if (this.watchers.has(targetPath)) return;
    const watcher = fs.watch(targetPath);
    watcher.on('error', () => void this.unwatch(targetPath));
    watcher.on('change', (event, fileName) => {
      if (event === 'change') this.emit(event, targetPath);
      if (event === 'rename') {
        const dir = path.dirname(targetPath);
        const filePath = path.join(dir, fileName);
        if (targetPath !== filePath) {
          this.emit(event, targetPath, filePath);
        }
        this.unwatch(targetPath);
        setTimeout(() => {
          this.checkPath(dir, targetPath, filePath);
        }, 0);
      }
    });
    this.watchers.set(targetPath, watcher);
  }

  fileHandler(filePath) {
    const { ignoredExts, ignoredFiles } = this;
    const { ext, base, name } = path.parse(filePath);
    if (ignoredExts.has(ext) || ignoredExts.has(ext.slice(1))) return;
    if (ignoredFiles.has(name) || ignoredFiles.has(base)) return;
    this.watchFile(filePath);
  }

  directoryHandler(dirPath) {
    const { ignoredPaths } = this;
    const dirName = path.basename(dirPath);
    if (ignoredPaths.has(dirName) || ignoredPaths.has(dirPath)) return;
    this.watch(dirPath);
  }

  unwatch(filePath) {
    const watcher = this.watchers.get(filePath);
    if (!watcher) return;
    watcher.close();
    this.watchers.delete(filePath);
  }

  watch(root = process.cwd()) {
    const options = { withFileTypes: true };
    fs.readdir(root, options, (err, files) => {
      if (err) return this;
      for (const file of files) {
        const dirPath = path.join(root, file.name);
        if (file.isDirectory()) this.directoryHandler(dirPath);
        if (file.isFile()) this.fileHandler(dirPath);
      }
    });
    return this;
  }

  stop() {
    for (const [filePath] of this.watchers) this.unwatch(filePath);
  }
}

module.exports = Watcher;
