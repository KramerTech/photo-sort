import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import type { Color, Titlebar } from "custom-electron-titlebar";
import type { IpcRenderer } from "electron";
import { stringify } from "querystring";

const electron = (window as any).require('electron');
const titlebar = (window as any).require('custom-electron-titlebar');

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {

	SCROLL_DELAY = 35;

	SIDE = 4;
	SHOWN = this.SIDE + 1 + this.SIDE;

	min = Math.min;
	refresh: () => void;

	selected = new Set<string>();

	current = 0;
	path: string;

	// Controls remain locked until current image has been loaded
	locked = true;
	done = false;
	exporting?: { file: string, index: number };

	images: string[] = [];
	display: string[] = [];

	events: IpcRenderer = electron.ipcRenderer;

	binds: any = {};

	constructor(
		refresher: ChangeDetectorRef,
	) {
		this.refresh = () => refresher.detectChanges();

		new titlebar.Titlebar({
			backgroundColor: titlebar.Color.fromHex("#13334C"),
			titleHorizontalAlignment: "left",
			menu: undefined,
		});

		this.resetDisplay();
		window.onkeydown = (key) => {
			if (key.code === "ArrowRight") {
				if (this.binds.right) { return; }
				this.binds.right = setTimeout(() => {
					this.scroll();
					this.binds.right = setInterval(() => {
						this.scroll();
					}, this.SCROLL_DELAY);
				}, 500);
			} else if (key.code === "ArrowLeft") {
				if (this.binds.left) { return; }
				this.binds.left = setTimeout(() => {
					this.scroll(-1);
					this.binds.left = setInterval(() => {
						this.scroll(-1);
					}, this.SCROLL_DELAY);
				}, 500);
			}
		}

		window.onkeyup = (key) => {
			console.log(key);
			if (key.code === "ArrowRight") {
				clearInterval(this.binds.right);
				delete this.binds.right;
				this.scroll();
			} else if (key.code === "ArrowLeft") {
				clearInterval(this.binds.left);
				delete this.binds.left;
				this.scroll(-1);
			} else if (key.code === "Space") {
				this.select();
			} else if (key.code === "KeyR") {
				// this.locked = false;
			} else if (key.code === "KeyE") {
				this.exportCheck();
			}
		}
	}

	private exportMessage = "Are you sure you want to export selected photos "
			+ "before you've finished sorting through your project? "
			+ "All of the same selected photos will be included again the next time you export.";

	private exportCheck() {
		if ((this.done && this.current >= this.images.length) || (window.confirm(this.exportMessage))) {
			this.events.send("export");
			this.locked = true;
			this.display = [];
			for (let i = 0; i < this.SHOWN; i++) { this.display.push(undefined); }
		}
	}

	private exportDone(err: any) {
		this.locked = false;
		if (!this.exporting) { return; }
		delete this.exporting;

		this.resetDisplay();
		this.refresh();

		if (!err) {
			alert("Export Complete!");
		} else {
			alert("Export failed: " + err);
		}
	}

	resetDisplay() {
		this.display = [];
		for(let i = -this.SIDE; i <= this.SIDE; i++) {
			this.display.push(this.images[this.current + i]);
		}
	}

	isSelected(idx: number): boolean {
		if (this.exporting) { return false; }
		return this.selected.has(this.display[idx]);
	}

	select() {
		if (this.locked) { return; }
		const current = this.images[this.current];
		if (!current) { return; }
		const exists = this.selected.has(current);
		if (exists) {
			this.selected.delete(current);
		} else {
			this.selected.add(current);
			console.log("add");
		}
		this.refresh();
		this.events.send("select", current, !exists);
	}

	scroll(dir = 1) {
		if (this.locked) { return; }
		const target = this.current + dir;
		if (target < 0 || target > this.images.length) { return; }
		this.current = target;
		const imageLoc = this.current + dir * this.SIDE;
		const image = (imageLoc >= 0 && imageLoc < this.images.length) ? this.images[imageLoc] : undefined;
		if (dir < 1) {
			this.display.unshift(image);
			this.display.pop();
		} else {
			this.display.shift();
			this.display.push(image);
		}
		localStorage.setItem(this.path, "" + this.current);
		this.refresh();
	}

	opened(path: string) {
		this.path = path;
		this.images = [];
		this.resetDisplay();
		this.loadCurrent();
		this.events.send("load", path);
	}

	private loadCurrent() {
		const position = localStorage.getItem(this.path);
		if (position) {
			this.current = 1;//+position;
			this.refresh();
		}
	}

	addImage(image: string) {
		this.images.push(image);
		if (this.exporting) { return; }
		if (this.images.length > this.current - this.SIDE
				&& this.images.length <= this.current + this.SIDE + 1) {
			this.display.push(image);
			if (this.display.length > this.SHOWN) { this.display.shift(); }
			if (this.locked && this.images.length > this.current) {
				this.locked = false;
			}
		}
		this.refresh();
	}

	ngOnInit() {
		this.events.on("opened", (_, path) => {
			localStorage.setItem("last_path", path);
			this.opened(path)
		});

		this.events.on("done", () => this.done = true);
		this.events.on("copying", (_, data) => {
			if (!this.exporting || this.exporting.index <= data.index) {
				this.exporting = data; this.refresh();
			}
		});

		// Timeout is so that last update gets a chance to execute
		// Otherwise, depending on race condition, it can look like the last picture didn't export
		this.events.on("exportDone", (_, err) => {
			this.exporting.index = this.selected.size - 1;
			setTimeout(() => this.exportDone(err));
		});

		this.events.on("image", (_, image) => this.addImage(image));
		this.events.on("images", (_, images: string[], selected: string[]) => {
			console.log(images);
			this.images = images;
			this.selected = new Set();
			selected.forEach(s => this.selected.add(s));
			this.resetDisplay();
			this.refresh();
			if (this.locked && this.images.length > this.current) {
				this.locked = false;
			}
		});

		const last = localStorage.getItem("last_path");
		if (last && last !== "null" && false) {
			this.opened(last);
		} else {
			this.events.send("fileDialog");
		}
	}

}