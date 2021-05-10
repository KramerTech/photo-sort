"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var electron_1 = require("electron");
var fs_1 = require("fs");
var image_type_1 = require("image-type");
var is_image_1 = require("is-image");
var nedb_promises_1 = require("nedb-promises");
var path_1 = require("path");
var read_chunk_1 = require("read-chunk");
var url_1 = require("url");
var winattr_1 = require("winattr");
var isWindows = process.platform === "win32";
var win;
var dataDir = path_1["default"].join(electron_1.app.getPath("appData"), "photo-sort");
var pathStore = nedb_promises_1["default"].create({
    filename: path_1["default"].join(dataDir, "projects.db"),
    autoload: true
});
var projectStore;
var projectEntry;
function randomKey() {
    var key = "";
    do {
        key += Math.random().toString(36).substr(2).toUpperCase();
    } while (key.length < 12);
    return key.substr(0, 12);
}
function load(loc) {
    return __awaiter(this, void 0, void 0, function () {
        var images, selected;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (projectEntry && projectEntry._id === loc) {
                        return [2 /*return*/];
                    }
                    bufferInsert();
                    return [4 /*yield*/, pathStore.findOne({ _id: loc })];
                case 1:
                    projectEntry = _a.sent();
                    if (!projectEntry) {
                        projectEntry = {
                            _id: loc,
                            done: false,
                            store: randomKey() + ".db"
                        };
                        pathStore.insert(projectEntry);
                    }
                    // Load the actual project store
                    projectStore = nedb_promises_1["default"].create({
                        filename: path_1["default"].join(dataDir, projectEntry.store),
                        autoload: true
                    });
                    return [4 /*yield*/, projectStore.find({ ignore: { $exists: false } })];
                case 2:
                    images = (_a.sent()).map(function (i) { return i._id; });
                    return [4 /*yield*/, projectStore.find({ selected: true })];
                case 3:
                    selected = (_a.sent()).map(function (i) { return i._id; });
                    win.webContents.send("images", images, selected);
                    if (!projectEntry.done) {
                        loadImages(loc, ++imageLoad, true);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function selectImage(image, selected) {
    projectStore.update({ _id: image }, { $set: { selected: selected } });
}
var insertBuffer = [];
function bufferInsert(image, ignore) {
    if (image) {
        var build = { _id: image };
        // Only store the key if necessary (save space)
        if (ignore) {
            build.ignore = true;
        }
        insertBuffer.push(build);
    }
    if (insertBuffer.length && (!image || insertBuffer.length >= 500)) {
        projectStore.insert(insertBuffer);
        insertBuffer = [];
    }
}
// Incremented when opening a new project location to stop previous loads
var imageLoad = 0;
function loadImages(loc, stopCheck, top) {
    return __awaiter(this, void 0, void 0, function () {
        var children, files, dirs, _i, files_1, file, ignore, _a, _b, _c, dirs_1, dir, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (imageLoad !== stopCheck) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, fs_1.promises.readdir(loc, { withFileTypes: true })];
                case 1:
                    children = _e.sent();
                    children = children.filter(function (child) { return !child.name.startsWith("."); });
                    files = children.filter(function (e) { return e.isFile() && is_image_1["default"](e.name); })
                        .sort(function (a, b) { return a.name.localeCompare(b.name); })
                        .map(function (f) { return path_1["default"].join(loc, f.name); });
                    dirs = children.filter(function (e) { return e.isDirectory(); })
                        .sort(function (a, b) { return a.name.localeCompare(b.name); })
                        .map(function (f) { return path_1["default"].join(loc, f.name); });
                    _i = 0, files_1 = files;
                    _e.label = 2;
                case 2:
                    if (!(_i < files_1.length)) return [3 /*break*/, 8];
                    file = files_1[_i];
                    return [4 /*yield*/, projectStore.findOne({ _id: file })];
                case 3:
                    if ((_e.sent()) !== null) {
                        return [3 /*break*/, 7];
                    }
                    // Stopcheck as we iterate files
                    if (imageLoad !== stopCheck) {
                        return [2 /*return*/];
                    }
                    ignore = true;
                    _a = !isWindows;
                    if (_a) return [3 /*break*/, 5];
                    return [4 /*yield*/, isHidden(file)];
                case 4:
                    _a = !(_e.sent());
                    _e.label = 5;
                case 5:
                    if (!_a) return [3 /*break*/, 7];
                    _b = image_type_1["default"];
                    return [4 /*yield*/, read_chunk_1["default"](file, 0, image_type_1["default"].minimumBytes)];
                case 6:
                    // Validate images actully contain image data
                    if (_b.apply(void 0, [_e.sent()])) {
                        // Stopcheck before sending a new image
                        if (imageLoad !== stopCheck) {
                            return [2 /*return*/];
                        }
                        // Makes sure the image is really real
                        // deals with stuff like iPhoto libraries
                        win.webContents.send("image", file);
                        ignore = false;
                    }
                    bufferInsert(file, ignore);
                    _e.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 2];
                case 8:
                    _c = 0, dirs_1 = dirs;
                    _e.label = 9;
                case 9:
                    if (!(_c < dirs_1.length)) return [3 /*break*/, 14];
                    dir = dirs_1[_c];
                    // Stopcheck as we iterate directories
                    if (imageLoad !== stopCheck) {
                        return [2 /*return*/];
                    }
                    _d = isWindows;
                    if (!_d) return [3 /*break*/, 11];
                    return [4 /*yield*/, isHidden(dir)];
                case 10:
                    _d = (_e.sent());
                    _e.label = 11;
                case 11:
                    if (_d) {
                        return [3 /*break*/, 13];
                    }
                    return [4 /*yield*/, loadImages(dir, stopCheck)];
                case 12:
                    _e.sent();
                    _e.label = 13;
                case 13:
                    _c++;
                    return [3 /*break*/, 9];
                case 14:
                    if (!top) return [3 /*break*/, 16];
                    win.webContents.send("done");
                    bufferInsert();
                    return [4 /*yield*/, pathStore.update({ _id: loc }, { $set: { done: true } })];
                case 15:
                    _e.sent();
                    _e.label = 16;
                case 16: return [2 /*return*/];
            }
        });
    });
}
function exportSelected() {
    return __awaiter(this, void 0, void 0, function () {
        var err, loc, images, root, i, image, ext, fileName, target, append, sub, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    err = undefined;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 8, 9, 10]);
                    return [4 /*yield*/, electron_1.dialog.showOpenDialog(win, {
                            defaultPath: projectEntry._id,
                            properties: ["openDirectory"]
                        })];
                case 2:
                    loc = _a.sent();
                    if (loc.canceled) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, projectStore.find({ selected: true })];
                case 3:
                    images = (_a.sent()).map(function (i) { return i._id; });
                    root = path_1["default"].join(loc.filePaths[0], "photo-sort-export");
                    if (!fs_1.existsSync(root)) {
                        fs_1.mkdirSync(root);
                    }
                    i = 0;
                    _a.label = 4;
                case 4:
                    if (!(i < images.length)) return [3 /*break*/, 7];
                    image = images[i];
                    win.webContents.send("copying", { file: image, index: i });
                    ext = path_1["default"].extname(image);
                    fileName = path_1["default"].basename(image);
                    fileName = fileName.substr(0, fileName.length - ext.length);
                    target = path_1["default"].join(root, fileName);
                    append = "";
                    sub = 2;
                    while (fs_1.existsSync(target + append + ext)) {
                        append = "_" + sub++;
                    }
                    return [4 /*yield*/, fs_1.promises.copyFile(image, target + append + ext)];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    i++;
                    return [3 /*break*/, 4];
                case 7: return [3 /*break*/, 10];
                case 8:
                    e_1 = _a.sent();
                    err = e_1;
                    console.log(e_1);
                    return [3 /*break*/, 10];
                case 9:
                    win.webContents.send("exportDone", err);
                    return [7 /*endfinally*/];
                case 10: return [2 /*return*/];
            }
        });
    });
}
function isHidden(loc) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) {
                    winattr_1["default"].get(loc, function (err, attr) {
                        resolve(!!(err || attr.hidden || attr.system));
                    });
                })];
        });
    });
}
function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 800,
        height: 800,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true
        }
    });
    win.loadURL(url_1["default"].format({
        pathname: path_1["default"].join(__dirname, "./dist/PhotoSort/index.html"),
        protocol: "file:",
        slashes: true
    }));
    // win.webContents.openDevTools();
    win.maximize();
    win.focus();
    win.on("closed", function () { win = null; });
    electron_1.ipcMain.on("export", function () { return exportSelected(); });
    electron_1.ipcMain.on("select", function (_, image, selected) { return selectImage(image, selected); });
    electron_1.ipcMain.on("load", function (_, loc) { return load(loc); });
    electron_1.ipcMain.on("fileDialog", function (_, loc) {
        if (loc === void 0) { loc = electron_1.app.getPath("home"); }
        electron_1.dialog.showOpenDialog(win, {
            defaultPath: loc,
            properties: ["openDirectory"]
        }).then(function (res) {
            win.webContents.send("opened", res.canceled ? null : res.filePaths[0]);
        });
    });
}
electron_1.app.on("ready", createWindow);
electron_1.app.on("activate", function () { return win === null && createWindow(); });
// On macOS it is common for applications and their menu bar
// to stay active until the user quits explicitly with Cmd + Q
electron_1.app.on('window-all-closed', function () { return process.platform !== 'darwin' && electron_1.app.quit(); });
