"use strict";
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Geekrainian
//
// Electron shell around the browser viewer. It only hosts viewer.html in a Chromium
// window — all rendering and file access stays in the same client code the browser uses
// (webkitdirectory picker, drag-drop, WebGL S3TC), so nothing here talks to Node on the
// renderer side. Renderer runs sandboxed with Node integration off.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");

// No app menu: the default File/Edit/View/Window items don't apply to a fly-camera
// viewer. Removing it drops the menu bar on Windows/Linux (macOS keeps a minimal one).
Menu.setApplicationMenu(null);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: "#0b0d10",
    title: "KF Map Viewer",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, "..", "viewer.html"));

  // External links (readme, three.js, trademark notice) open in the real browser, not in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
