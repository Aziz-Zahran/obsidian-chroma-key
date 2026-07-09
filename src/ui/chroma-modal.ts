import { Modal, Setting, App, TFile } from 'obsidian';
import type { ChromaKeySettings } from '../types';
import { loadImageFromBlob, applyChromaKey } from '../chroma-key';
import { extensionToMime } from '../main';

export interface ChromaModalResult {
	tolerance: number;
	autoDetectColor: boolean;
	edgeSoftening: boolean;
	invertColors: boolean;
	targetColor: string;
}

/**
 * Modal that lets the user configure chroma key settings before processing.
 * Opens when the user right-clicks an image and selects "Remove background".
 */
export class ChromaKeyModal extends Modal {
	private file: TFile;
	private settings: ChromaKeySettings;
	private onSubmit: (result: ChromaModalResult) => void;

	private originalImageData: ImageData | null = null;
	private previewCtx: CanvasRenderingContext2D | null = null;
	private previewCanvas!: HTMLCanvasElement;
	private settingsContainer!: HTMLDivElement;
	private eyedropperActive = false;

	constructor(
		app: App,
		file: TFile,
		defaults: ChromaKeySettings,
		onSubmit: (result: ChromaModalResult) => void,
	) {
		super(app);
		this.file = file;
		this.settings = { ...defaults };
		this.onSubmit = onSubmit;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle('Remove background');

		const previewContainer = contentEl.createDiv({ cls: 'chroma-preview-container' });

		this.previewCanvas = previewContainer.createEl('canvas', { cls: 'chroma-preview-canvas' });
		this.previewCtx = this.previewCanvas.getContext('2d');

		this.setupCanvasClick();

		this.settingsContainer = contentEl.createDiv('settings-container');

		await this.loadImageData();

		this.renderSettings();
	}

	private async loadImageData() {
		try {
			const buffer = await this.app.vault.readBinary(this.file);
			const mimeType = extensionToMime(this.file.extension);
			const blob = new Blob([buffer], { type: mimeType });
			const img = await loadImageFromBlob(blob);

			this.previewCanvas.width = img.width;
			this.previewCanvas.height = img.height;

			if (this.previewCtx) {
				this.previewCtx.drawImage(img, 0, 0);
				this.originalImageData = this.previewCtx.getImageData(0, 0, img.width, img.height);
			}

			this.updatePreview();
		} catch (error) {
			console.error("Failed to load image for preview", error);
		}
	}

	private updatePreview() {
		if (!this.originalImageData || !this.previewCtx) return;

		const workingData = new ImageData(
			new Uint8ClampedArray(this.originalImageData.data),
			this.originalImageData.width,
			this.originalImageData.height
		);

		applyChromaKey(workingData, this.settings);

		this.previewCtx.putImageData(workingData, 0, 0);
	}

	private setEyedropper(active: boolean) {
		this.eyedropperActive = active;
		this.previewCanvas.toggleClass('chroma-eyedropper-active', active);
	}

	private setupCanvasClick() {
		this.previewCanvas.addEventListener('click', (event) => {
			if (!this.eyedropperActive || !this.originalImageData) return;

			const rect = this.previewCanvas.getBoundingClientRect();

			const scaleX = this.previewCanvas.width / rect.width;
			const scaleY = this.previewCanvas.height / rect.height;

			const x = Math.floor((event.clientX - rect.left) * scaleX);
			const y = Math.floor((event.clientY - rect.top) * scaleY);

			const index = (y * this.previewCanvas.width + x) * 4;
			const r = this.originalImageData.data[index]!;
			const g = this.originalImageData.data[index + 1]!;
			const b = this.originalImageData.data[index + 2]!;

			const hexColor = "#" + [r, g, b]
				.map(v => v.toString(16).padStart(2, '0'))
				.join('')
				.toUpperCase();

			this.settings.targetColor = hexColor;
			this.settings.autoDetectColor = false;
			this.setEyedropper(false);

			this.renderSettings();
			this.updatePreview();
		});
	}

	private renderSettings() {
		this.settingsContainer.empty();

		new Setting(this.settingsContainer)
			.setName('Auto-detect background color')
			.setDesc('Sample the top-left pixel as the background color')
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.autoDetectColor)
					.onChange((value) => {
						this.settings.autoDetectColor = value;
						if (value) {
							this.setEyedropper(false);
						}
						this.updatePreview();
						this.renderSettings();
					}),
			);

		if (!this.settings.autoDetectColor) {
			new Setting(this.settingsContainer)
				.setName('Target color')
				.setDesc('Hex color to remove, or use the eyedropper to pick from the image')
				.addText((text) =>
					text
						.setPlaceholder('#Ffffff')
						.setValue(this.settings.targetColor)
						.onChange((value) => {
							const cleaned = value.trim();
							if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(cleaned)) {
								this.settings.targetColor = cleaned;
								this.updatePreview();
							}
						}),
				)
				.addButton((btn) =>
					btn
						.setIcon('pipette')
						.setTooltip('Pick color from image')
						.onClick(() => {
							this.setEyedropper(!this.eyedropperActive);
							btn.buttonEl.toggleClass('mod-cta', this.eyedropperActive);
						}),
				);
		}

		new Setting(this.settingsContainer)
			.setName('Edge softening')
			.setDesc('Smooth alpha blending at background edges')
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.edgeSoftening)
					.onChange((value) => {
						this.settings.edgeSoftening = value;
						this.updatePreview();
					}),
			);

		new Setting(this.settingsContainer)
			.setName('Invert colors')
			.setDesc('Invert colors of visible pixels (great for dark mode diagrams)')
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.invertColors)
					.onChange((value) => {
						this.settings.invertColors = value;
						this.updatePreview();
					}),
			);

		new Setting(this.settingsContainer)
			.setName('Tolerance')
			.setDesc('Color distance threshold (0 = exact match, 100 = aggressive)')
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 1)
					.setValue(this.settings.tolerance)
					.setDynamicTooltip()
					.onChange((value) => {
						this.settings.tolerance = value;
						this.updatePreview();
					}),
			);

		new Setting(this.settingsContainer)
			.addButton((btn) =>
				btn
					.setButtonText('Process')
					.setCta()
					.onClick(() => {
						this.close();
						this.onSubmit({
							tolerance: this.settings.tolerance,
							autoDetectColor: this.settings.autoDetectColor,
							edgeSoftening: this.settings.edgeSoftening,
							invertColors: this.settings.invertColors,
							targetColor: this.settings.targetColor,
						});
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Cancel')
					.onClick(() => {
						this.close();
					}),
			);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
