const fs = require("node:fs");
const path = require("node:path");

const iconPath = path.join(__dirname, "desktop", "assets", "icon.ico");
const hasWindowsIcon = fs.existsSync(iconPath);

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: "com.cakrawalasasmita.iris.remoteorganizer",
  productName: "IRIS Remote Organizer",
  directories: {
    output: "dist-electron",
  },
  files: [
    "desktop/**/*",
    "src/**/*",
    "package.json",
    ".env.example",
    ".env.remote.example",
  ],
  win: {
    target: [
      {
        target: "portable",
        arch: ["x64"],
      },
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    ...(hasWindowsIcon ? { icon: iconPath } : {}),
  },
  portable: {
    artifactName: "IRIS-Remote-Organizer-Portable-${version}-${arch}.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "IRIS Remote Organizer",
    artifactName: "IRIS-Remote-Organizer-Setup-${version}-${arch}.${ext}",
  },
};

module.exports = config;
