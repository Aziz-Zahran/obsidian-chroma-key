import { Modal, Setting, App } from 'obsidian';
import type { ChromaKeySettings } from '../types';

/**
 * Result returned by the modal when the user clicks Process.
 */
export interface ChromaModalResult {
	tolerance: number;
	autoDetectColor: boolean;
	edgeSoftening: boolean;
	targetColor: string;
}

/**
 * Modal that lets the user configure chroma key settings before processing.
 * Opens when the user right-clicks an image and selects "Remove background".
 */
export class ChromaKeyModal extends Modal {
	private settings: ChromaKeySettings;
	private onSubmit: (result: ChromaModalResult) => void;

	constructor(
		app: App,
		defaults: ChromaKeySettings,
		onSubmit: (result: ChromaModalResult) => void,
	) {
		super(app);
		// Clone defaults so the modal doesn't mutate the plugin settings
		this.settings = { ...defaults };
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		this.setTitle('Remove background');

		// Tolerance slider
		new Setting(contentEl)
			.setName('Tolerance')
			.setDesc('Color distance threshold (0 = exact match, 100 = aggressive)')
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 1)
					.setValue(this.settings.tolerance)
					.setDynamicTooltip()
					.onChange((value) => {
						this.settings.tolerance = value;
					}),
			);

		// Auto-detect toggle
		new Setting(contentEl)
			.setName('Auto-detect background color')
			.setDesc('Sample the top-left pixel as the background color')
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.autoDetectColor)
					.onChange((value) => {
						this.settings.autoDetectColor = value;
						// Re-render to show/hide color picker
						this.onOpen();
					}),
			);

		// Manual color (only when auto-detect is off)
		if (!this.settings.autoDetectColor) {
			new Setting(contentEl)
				.setName('Target color')
				.setDesc('Hex color to remove (e.g. #Ffffff)')
				.addText((text) =>
					text
						.setPlaceholder('#Ffffff')
						.setValue(this.settings.targetColor)
						.onChange((value) => {
							const cleaned = value.trim();
							if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(cleaned)) {
								this.settings.targetColor = cleaned;
							}
						}),
				);
		}

		// Edge softening toggle
		new Setting(contentEl)
			.setName('Edge softening')
			.setDesc('Smooth alpha blending at background edges')
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.edgeSoftening)
					.onChange((value) => {
						this.settings.edgeSoftening = value;
					}),
			);

		// Action buttons
		new Setting(contentEl)
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
