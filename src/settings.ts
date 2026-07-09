import { App, PluginSettingTab, Setting } from 'obsidian';
import type ChromaKeyPlugin from './main';

/**
 * Settings tab for the Chroma Key plugin.
 * These settings serve as defaults for the processing modal.
 */
export class ChromaKeySettingTab extends PluginSettingTab {
	plugin: ChromaKeyPlugin;

	constructor(app: App, plugin: ChromaKeyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('p', {
			text: 'These settings are used as defaults when you right-click an image and select "remove background".',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Auto-detect background color')
			.setDesc(
				'Sample the top-left pixel of the image to determine the background color. Turn off to use a fixed target color.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoDetectColor)
					.onChange(async (value) => {
						this.plugin.settings.autoDetectColor = value;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (!this.plugin.settings.autoDetectColor) {
			new Setting(containerEl)
				.setName('Target color')
				.setDesc(
					'The background color to remove (hex format, e.g. #Ffffff for white).',
				)
				.addText((text) =>
					text
						.setPlaceholder('#Ffffff')
						.setValue(this.plugin.settings.targetColor)
						.onChange(async (value) => {
							const cleaned = value.trim();
							if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(cleaned)) {
								this.plugin.settings.targetColor = cleaned;
								await this.plugin.saveSettings();
							}
						}),
				);
		}

		new Setting(containerEl)
			.setName('Default tolerance')
			.setDesc(
				'Default color distance threshold for the processing modal (0 = exact match, 100 = very aggressive).',
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 1)
					.setValue(this.plugin.settings.tolerance)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.tolerance = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Edge softening')
			.setDesc(
				'Apply smooth alpha blending at the edges of the removed background for cleaner results.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.edgeSoftening)
					.onChange(async (value) => {
						this.plugin.settings.edgeSoftening = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Invert colors')
			.setDesc(
				'Invert the colors of visible pixels after background removal.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.invertColors)
					.onChange(async (value) => {
						this.plugin.settings.invertColors = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
