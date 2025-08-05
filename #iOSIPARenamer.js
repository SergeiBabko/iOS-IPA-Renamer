const fs = require('fs');
const path = require('path');
const util = require('util');
const yauzl = require('yauzl');
const plist = require('plist');
const bplist = require('bplist-parser');

const rootPath = __dirname;

class iOSIPARenamerSettings {
  /**
   * Enables or disables including the original file name in the renamed output.
   * Set to `true` to prepend the original name, or `false` to omit it.
   */
  static INCLUDE_ORIGINAL_NAME = true;

  /**
   * Enables or disables saving logs during the renaming process.
   * Set to `true` to keep logs, or `false` to disable logging.
   */
  static SAVE_LOGS = false;

  /**
   * List of folder names to ignore during the scan.
   * Any directory matching a name in this list will be skipped.
   */
  static IGNORED_DIRECTORIES = [
    '#Ignored',
    'node_modules', // DO NOT REMOVE
  ];

  /**
   * List of file names to ignore during the scan.
   * Any file matching a name in this list will be skipped.
   */
  static IGNORED_FILES = [
    '#iOSIPARenamer.bat', // DO NOT REMOVE
    '#iOSIPARenamer.js',  // DO NOT REMOVE
    'package.json',       // DO NOT REMOVE
    'package-lock.json',  // DO NOT REMOVE
  ];

  /**
   * List of supported file extensions.
   * Files with these extensions will be considered for renaming.
   */
  static SUPPORTED_EXTENSIONS = [
    '.ipa',
  ];

  /**
   * List of folder and file names to remove after the scan.
   * Any directories and files matching a name in this list will be removed.
   */
  static DELETE_ON_COMPLETE = [
    'node_modules',      // DO NOT REMOVE
    'package.json',      // DO NOT REMOVE
    'package-lock.json', // DO NOT REMOVE
  ];
}

class iOSIPARenamer {
  #renamedFilesLength = 0;
  #skippedFilesLength = 0;

  #renameFile = util.promisify(fs.rename);
  #readDir = util.promisify(fs.readdir);
  #rm = util.promisify(fs.rm);
  #unlinkFile = util.promisify(fs.unlink);
  #stat = util.promisify(fs.stat);

  async rename() {
    LoggerUtils.printHeader();
    LoggerUtils.cyan(`📂 ${L10n.get(L10n.Keys.SCANNED_DIR)}: ${rootPath}`);
    LoggerUtils.indent('-');
    const performance = await PerformanceWrapper.getCallbackPerformance(this.#renameFiles.bind(this));
    LoggerUtils.indent('-');
    LoggerUtils.cyan(`✅ ${L10n.get(L10n.Keys.RENAMED)}: ${this.#renamedFilesLength}`);
    LoggerUtils.cyan(`⚠️ ${L10n.get(L10n.Keys.SKIPPED)}: ${this.#skippedFilesLength}`);
    LoggerUtils.cyan(`🕒 ${L10n.get(L10n.Keys.OPERATION_TIME)}: ${performance}`);
    LoggerUtils.indent('-');
    LoggerUtils.printFooter();
    if (iOSIPARenamerSettings.SAVE_LOGS) {
      LoggerUtils.saveLogsToFile(rootPath, '#IPArenamerLogs.txt');
    }
  }

  async #renameFiles() {
    const allFiles = await this.#walkDir(rootPath);

    for (const filePath of allFiles) {
      const fileExt = path.extname(filePath).toLowerCase();
      const supported = this.#isFileSupported(fileExt);

      if (!supported) {
        this.#logWarning(L10n.Keys.UNSUPPORTED_EXT, filePath);
        this.#skippedFilesLength++;
        continue;
      }

      const info = await this.#extractInfoFromIPA(filePath);

      if (!info) {
        this.#logError(L10n.Keys.MISSING_METADATA, filePath);
        this.#skippedFilesLength++;
        continue;
      }

      const newFilePath = this.#getNewFilePath(info, fileExt, filePath);

      if (!newFilePath) {
        this.#logWarning(L10n.Keys.ALREADY_RENAMED, filePath, '☑️');
        this.#skippedFilesLength++;
        continue;
      }

      await this.#safeRenameFile(filePath, newFilePath);
    }

    await this.#cleanup();
  }

  #isFileSupported(fileExt) {
    return iOSIPARenamerSettings.SUPPORTED_EXTENSIONS.includes(fileExt);
  }

  async #extractInfoFromIPA(ipaPath) {
    return new Promise((resolve) => {
      yauzl.open(ipaPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
        if (err) return resolve(null);

        zipfile.readEntry();
        zipfile.on('entry', entry => {
          if (!/Payload\/[^/]+\.app\/Info\.plist$/.test(entry.fileName)) {
            return zipfile.readEntry();
          }

          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              zipfile.close();
              return resolve(null);
            }

            const chunks = [];
            readStream.on('data', chunk => chunks.push(chunk));
            readStream.on('end', () => {
              const buffer = Buffer.concat(chunks);
              let data;
              try {
                data = buffer.slice(0, 6).toString() === 'bplist'
                  ? bplist.parseBuffer(buffer)[0]
                  : plist.parse(buffer.toString());
              } catch {
                zipfile.close();
                return resolve(null);
              }

              zipfile.close();

              const appName = (data.CFBundleDisplayName || data.CFBundleName || data.BundleDisplayName || data.UILocalizedDisplayName)?.replace(/[\/\\:*?"<>|]/g, ' ') || 'UnknownName';
              const rawVersion = data.CFBundleShortVersionString || data.CFBundleVersion || null;
              const version = rawVersion ? ` [v${rawVersion}]` : '';
              const minIOS = ` [iOS ${data.MinimumOSVersion || '0.0.0'}]`;

              resolve({ appName, version, minIOS });
            });
          });
        });

        zipfile.on('end', () => resolve(null));
      });
    });
  }


  #getNewFilePath(info, fileExt, originalPath) {
    const dirName = path.dirname(originalPath);
    const realExt = path.extname(originalPath);
    const fileName = path.basename(originalPath, realExt);
    const prefix = iOSIPARenamerSettings.INCLUDE_ORIGINAL_NAME ? `${fileName} ↔ ` : '';
    const newName = `${prefix}${info.appName} –${info.version}${info.minIOS}${fileExt}`;
    const safeNewName = newName.replace(/[\/\\:*?"<>|]/g, ' ');
    const newPath = path.join(dirName, safeNewName);
    return newPath === originalPath ? null : newPath;
  }

  async #safeRenameFile(filePath, newFilePath) {
    try {
      await this.#renameFile(filePath, newFilePath);
      const fromTo = `${filePath} → ${path.basename(newFilePath)}`;
      this.#logSuccess(L10n.Keys.RENAMED, fromTo);
      this.#renamedFilesLength++;
    } catch (err) {
      this.#logError(L10n.Keys.ERROR_RENAMING, filePath, err);
      this.#skippedFilesLength++;
    }
  }

  async #walkDir(dir, fileList = []) {
    let entries;

    try {
      entries = await this.#readDir(dir, { withFileTypes: true });
    } catch (err) {
      this.#logError(L10n.Keys.ERROR_RD_DIR, dir, err);
      return fileList;
    }

    for (const entry of entries) {
      const entryName = entry.name;
      const fullPath = path.join(dir, entryName);

      const isIgnoredDir = entry.isDirectory() && (
        iOSIPARenamerSettings.IGNORED_DIRECTORIES
          .some(ignored => ignored.toLowerCase() === entryName.toLowerCase())
        || entryName.startsWith('.')
      );

      const isIgnoredFile = entry.isFile() &&
        iOSIPARenamerSettings.IGNORED_FILES
          .some(ignored => ignored.toLowerCase() === entryName.toLowerCase());

      if (isIgnoredDir || isIgnoredFile) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.#walkDir(fullPath, fileList);
      } else {
        fileList.push(fullPath);
      }
    }

    return fileList;
  }

  async #cleanup() {
    for (const entry of iOSIPARenamerSettings.DELETE_ON_COMPLETE) {
      const fullPath = path.join(rootPath, entry);
      await this.#deletePathRecursive(fullPath);
    }
  }

  async #deletePathRecursive(targetPath) {
    try {
      const stat = await this.#stat(targetPath);
      if (stat.isDirectory()) {
        const entries = await this.#readDir(targetPath);
        for (const entry of entries) {
          const subPath = path.join(targetPath, entry);
          await this.#deletePathRecursive(subPath);
        }
        await this.#rm(targetPath, { recursive: true });
      } else {
        await this.#unlinkFile(targetPath);
      }
      // LoggerUtils.yellow(`❌ ${L10n.get(L10n.Keys.DELETED)}: ${targetPath}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // this.#logError(L10n.Keys.ERROR_DELETE, targetPath, err);
      }
    }
  }

  #logSuccess(key, filePath) {
    LoggerUtils.green(`✅ ${L10n.get(key)}: ${filePath}`);
  }

  #logWarning(key, filePath, icon = `⚠️`) {
    LoggerUtils.yellow(`${icon} ${L10n.get(key)}: ${filePath}`);
  }

  #logError(key, filePath, err) {
    const message = err?.message ? `:\n${err.message}` : '';
    LoggerUtils.red(`⛔ ${L10n.get(key)}: ${filePath}${message}`);
  }
}

class PerformanceWrapper {
  static async getCallbackPerformance(callback) {
    const startTime = Date.now();
    await callback().catch(LoggerUtils.red);
    const endTime = Date.now();
    return PerformanceWrapper.#formatPerformance(endTime - startTime);
  }

  static #formatPerformance(ms) {
    const hours = Math.floor(ms / 3600000);
    ms %= 3600000;
    const minutes = Math.floor(ms / 60000);
    ms %= 60000;
    const seconds = Math.floor(ms / 1000);
    const milliseconds = Math.floor(ms % 1000);

    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const padMs = (n) => String(n).padStart(3, '0');

    if (hours) {
      return `${pad(hours)}.${pad(minutes)}.${pad(seconds)}:${padMs(milliseconds)} (h.m.s:ms)`;
    } else if (minutes) {
      return `${pad(minutes)}.${pad(seconds)}:${padMs(milliseconds)} (m.s:ms)`;
    } else if (seconds) {
      return `${seconds}:${padMs(milliseconds)} (s:ms)`;
    } else {
      return `${milliseconds} (ms)`;
    }
  }
}

class L10n {
  static Keys = Object.freeze({
    RENAMED: 'renamed',
    SKIPPED: 'skipped',
    DELETED: 'deleted',
    SCANNED_DIR: 'directory',
    MISSING_METADATA: 'missingMetadata',
    UNSUPPORTED_EXT: 'unsupported',
    ALREADY_RENAMED: 'alreadyRenamed',
    ERROR_RENAMING: 'errorRenaming',
    ERROR_DELETE: 'errorDelete',
    ERROR_RD_DIR: 'errorRdFolder',
    OPERATION_TIME: 'operationTime',
  });

  static Translations = Object.freeze({
    [L10n.Keys.RENAMED]: { ru: 'Переименовано', en: 'Renamed' },
    [L10n.Keys.SKIPPED]: { ru: 'Пропущено', en: 'Skipped' },
    [L10n.Keys.DELETED]: { ru: 'Удалено', en: 'Deleted' },
    [L10n.Keys.SCANNED_DIR]: { ru: 'Сканируемая папка', en: 'Scanned directory' },
    [L10n.Keys.MISSING_METADATA]: { ru: 'Не удалось извлечь метаданные', en: 'Missing metadata' },
    [L10n.Keys.UNSUPPORTED_EXT]: { ru: 'Неподдерживаемое расширение', en: 'Unsupported extension' },
    [L10n.Keys.ALREADY_RENAMED]: { ru: 'Уже переименовано', en: 'Already renamed' },
    [L10n.Keys.ERROR_RENAMING]: { ru: 'Ошибка при переименовании', en: 'Error renaming' },
    [L10n.Keys.ERROR_DELETE]: { ru: 'Ошибка удаления', en: 'Error deleting' },
    [L10n.Keys.ERROR_RD_DIR]: { ru: 'Ошибка чтения папки', en: 'Read directory error' },
    [L10n.Keys.OPERATION_TIME]: { ru: 'Время выполнения', en: 'Execution time' },
  });

  static Language = (Intl.DateTimeFormat().resolvedOptions().locale || 'en').startsWith('ru') ? 'ru' : 'en';

  static get(key) {
    return L10n.Translations[key]?.[L10n.Language] || key;
  }
}

class LoggerUtils {
  static #logText = '';

  static printHeader() {
    LoggerUtils.clear();
    LoggerUtils.magenta(
      `╔════════════════════════╗
║     iOS IPA Renamer    ║
╚════════════════════════╝`
    );
    LoggerUtils.indent();
  }

  static printFooter() {
    LoggerUtils.indent();
    LoggerUtils.magenta(
      `╔═════════════════════════════╗
║     Thank You For Using     ║
║       iOS IPA Renamer       ║
║                             ║
║     © 2025 Sergei Babko     ║
║     All Rights Reserved     ║
╚═════════════════════════════╝`
    );
    LoggerUtils.indent();
  }

  static clear() {
    console.clear();
  }

  static log(...args) {
    console.log(...args);
    LoggerUtils.saveToLogs(...args);
  }

  static indent(symbol) {
    LoggerUtils.log(symbol ? symbol.repeat(100) : '');
  }

  static cyan(message) {
    LoggerUtils.log('\x1b[96m%s\x1b[0m', message);
  }

  static green(message) {
    LoggerUtils.log('\x1b[92m%s\x1b[0m', message);
  }

  static yellow(message) {
    LoggerUtils.log('\x1b[93m%s\x1b[0m', message);
  }

  static red(message) {
    LoggerUtils.log('\x1b[91m%s\x1b[0m', message);
  }

  static magenta(message) {
    LoggerUtils.log('\x1b[95m%s\x1b[0m', message);
  }

  static saveToLogs(...args) {
    args.forEach(arg => {
      if (
        typeof arg !== 'string' ||
        !/^\x1B\[[0-9;]*m%s\x1B\[0m$/.test(arg)
      ) {
        LoggerUtils.#logText += arg + '\n';
      }
    });
  }

  static getLogs() {
    return LoggerUtils.#logText;
  }

  static saveLogsToFile(rootPath, fileName) {
    const logText = LoggerUtils.getLogs();
    const targetPath = path.join(rootPath, fileName);
    fs.writeFileSync(targetPath, logText, 'utf-8');
  }
}

new iOSIPARenamer().rename();
