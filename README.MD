# 🗂 iOS IPA Renamer | [RU](https://github.com/SergeiBabko/iOSIPARenamer/blob/main/README.RU.MD)

<p align="center">
  <img src="./preview.png" alt="Preview" width="70%">
</p>

**iOSIPARenamer** is a lightweight Node.js utility that scans through a folder of `.ipa` packages, extracts app metadata, and renames each file into a consistent, human-readable format.

---

## 🔧 Features

* Recursively scans all `.ipa` files in the current directory and subdirectories
* Parses `Info.plist` (binary or XML) inside each archive to extract:
  * App display name or bundle name (e.g. `Angry Birds`)
  * Short version string (e.g. `v1.2.3`)
  * Minimum supported iOS version (e.g. `iOS 10.0`)
* Renames files to the format:
  * `OriginalName ↔ AppName – [v1.2.3] [iOS 10.0].ipa`
  * Omits original name if `INCLUDE_ORIGINAL_NAME` is set to `false`
* Skips unsupported packages
* Optionally saves a log file (`#IPArenamerLogs.txt`) when `SAVE_LOGS` is enabled
* Displays results in English or Russian based on your system language
* Prints a concise summary with runtime and file count
* Cleans up installation and log files after completion

---

## 🚀 How to Use

1. Install [Node.js](https://nodejs.org)

2. Place the script in the folder with your IPA files

3. Launch using one of the following methods:

* Double-click `#iOSIPARenamer.bat`
* Or run it manually in a terminal:

  ```bash
  npm install adm-zip plist bplist-parser
  node "#iOSIPARenamer.js"
  ```

4. Done! Your IPA files will be renamed based on their package name and versions.

---

## 📦 Supported File Types

This script only processes `.ipa` apps. All other file extensions will be ignored.

---

## 📁 Sample Output

```txt
📂 Apps and Games
├── Angry Birds SW ↔ Angry Birds Star Wars – [v1.2.0] [iOS 6.0].ipa
├── Townsmen v1144 ↔ Townsmen Premium – [v1.14.4] [iOS 10.0].ipa
└── YT v2.0.1 ↔ YouTube – [v2.0.1] [iOS 5.1].ipa
```

---

## ℹ️ Notes

* Files without a valid `Info.plist` entry are skipped
* Original IPA contents are never modified
* Automatic cleanup removes:

  * `node_modules`
  * `package.json`
  * `package-lock.json`

---

## 📊 After Completion

* Cleans up temporary dependencies
* Shows how many files were renamed
* Displays the total time taken
* Uses color-coded output for better readability
