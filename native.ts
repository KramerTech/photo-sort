import { app, BrowserWindow, dialog, ipcMain as incoming } from "electron";
import { existsSync, mkdirSync, promises as fs } from "fs";
import imageType from "image-type";
import isImage from "is-image";
import Datastore from "nedb-promises";
import path from "path";
import readChunk from "read-chunk";
import url from "url";
import winAttr from "winattr";

// TODO: DEV-ONLY
// require('electron-reload')(path.join(__dirname, "./dist"));

type PathStore = {
	_id: string,
	done: boolean,
	store: string,
};

type FileEntry = {
	_id: string,
	ignore?: boolean,
	selected?: boolean,
}

const isWindows = process.platform === "win32";

let win: BrowserWindow;


const dataDir = path.join(app.getPath("appData"), "photo-sort");
const pathStore = Datastore.create({
	filename: path.join(dataDir, "projects.db"),
	autoload: true,
});
let projectStore: Datastore;
let projectEntry: PathStore;

function randomKey() {
	let key = "";
	do {
		key += Math.random().toString(36).substr(2).toUpperCase();
	} while(key.length < 12);
	return key.substr(0, 12);
}

async function load(loc: string) {
	if (projectEntry && projectEntry._id === loc) { return; } 
	bufferInsert();

	projectEntry = await pathStore.findOne({ _id: loc });
	if (!projectEntry) {
		projectEntry = {
			_id: loc,
			done: false,
			store: randomKey() + ".db",
		};
		pathStore.insert(projectEntry);
	}

	// Load the actual project store
	projectStore = Datastore.create({
		filename: path.join(dataDir, projectEntry.store),
		autoload: true,
	});

	// If done, we don't need to fs load
	const images = (await projectStore.find({ ignore: {$exists: false} })).map(i => i._id);
	const selected = (await projectStore.find({ selected: true })).map(i => i._id);
	win.webContents.send("images", images, selected);
	if (!projectEntry.done) {
		loadImages(loc, ++imageLoad, true);
	}
}

function selectImage(image: string, selected: boolean) {
	projectStore.update({_id: image}, {$set: {selected}});
}

let insertBuffer: FileEntry[] = [];
function bufferInsert(image?: string, ignore?: boolean) {
	if (image) {
		const build: FileEntry = { _id: image };
		// Only store the key if necessary (save space)
		if (ignore) { build.ignore = true; }
		insertBuffer.push(build);
	}
	if (insertBuffer.length && (!image || insertBuffer.length >= 500)) {
		projectStore.insert(insertBuffer);
		insertBuffer = [];
	}
}

// Incremented when opening a new project location to stop previous loads
let imageLoad = 0;

async function loadImages(loc: string, stopCheck: number, top?: boolean) {
	if (imageLoad !== stopCheck) { return; }

	let children = await fs.readdir(loc, { withFileTypes: true });
	children = children.filter(child => !child.name.startsWith("."));
	
	let files = children.filter(e => e.isFile() && isImage(e.name))
						.sort((a, b) => a.name.localeCompare(b.name))
						.map(f => path.join(loc, f.name));
	let dirs = children.filter(e => e.isDirectory())
						.sort((a, b) => a.name.localeCompare(b.name))
						.map(f => path.join(loc, f.name));

	for (const file of files) {
		if (await projectStore.findOne({_id: file}) !== null) { continue; }
		// Stopcheck as we iterate files
		if (imageLoad !== stopCheck) { return; }

		let ignore = true;

		// Don't show hidden files
		if (!isWindows || !await isHidden(file)) {
			// Validate images actully contain image data
			if (imageType(await readChunk(file, 0, imageType.minimumBytes))) {
				// Stopcheck before sending a new image
				if (imageLoad !== stopCheck) { return; }
				// Makes sure the image is really real
				// deals with stuff like iPhoto libraries
				win.webContents.send("image", file);
				ignore = false;
			}
			bufferInsert(file, ignore);
		}
	}

	for (const dir of dirs) {
		// Stopcheck as we iterate directories
		if (imageLoad !== stopCheck) { return; }
		if (isWindows && await isHidden(dir)) { continue; }
		await loadImages(dir, stopCheck);
		// break; 
	}

	if (top) {
		win.webContents.send("done");
		bufferInsert();
		await pathStore.update({ _id: loc }, { $set: { done: true } });
	}
}

async function exportSelected() {
	let err = undefined;
	try {
		const loc = await dialog.showOpenDialog(win, {
			defaultPath: projectEntry._id,
			properties: ["openDirectory"]
		});
		if (loc.canceled) { return; }
		const images = (await projectStore.find({ selected: true })).map(i => i._id);
		const root = path.join(loc.filePaths[0], "photo-sort-export");
		if (!existsSync(root)) { mkdirSync(root); }
		for (let i = 0; i < images.length; i++) {
			// Update UI as to what's going on
			const image = images[i];
			win.webContents.send("copying", {file: image, index: i});

			// Parse out just the filename without the extension
			const ext = path.extname(image);
			let fileName = path.basename(image);
			fileName = fileName.substr(0, fileName.length - ext.length);

			// Don't overwrite anything
			const target = path.join(root, fileName);
			let append = "";
			let sub = 2;
			while (existsSync(target + append + ext)) {
				append = `_${sub++}`;
			}

			await fs.copyFile(image, target + append + ext);
		}
	} catch (e) {
		err = e;
		console.log(e);
	} finally {
		win.webContents.send("exportDone", err);
	}
}

async function isHidden(loc: string): Promise<boolean> {
	return new Promise(resolve => {
		winAttr.get(loc, (err: any, attr: any) => {
			resolve(!!(err || attr.hidden || attr.system));
		});
	});
}

function createWindow() {

	win = new BrowserWindow({
		width: 800,
		height: 800,
		frame: false,
		webPreferences: {
			nodeIntegration: true,
			enableRemoteModule: true,
		}
	});

	win.loadURL(
		url.format({
			pathname: path.join(__dirname, `./dist/PhotoSort/index.html`),
			protocol: "file:",
			slashes: true
		})
	);

	// win.webContents.openDevTools();
	win.maximize();
	win.focus();
	win.on("closed", () => { win = null; });
	
	incoming.on("export", () => exportSelected());
	incoming.on("select", (_, image, selected) => selectImage(image, selected));
	incoming.on("load", (_, loc) => load(loc));
	incoming.on("fileDialog", (_, loc = app.getPath("home")) => {
		dialog.showOpenDialog(win, {
			defaultPath: loc,
			properties: ["openDirectory"]
		}).then(res => {
			win.webContents.send("opened", res.canceled ? null : res.filePaths[0]);
		});
	});
}

 
app.on("ready", createWindow);
app.on("activate", () => win === null && createWindow());

// On macOS it is common for applications and their menu bar
// to stay active until the user quits explicitly with Cmd + Q
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());