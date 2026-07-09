import { Notice, Plugin, TFile, TFolder, MarkdownView } from 'obsidian';
import { DEFAULT_SETTINGS, IMAGE_EXTENSIONS, type ChromaKeySettings } from './types';
import { ChromaKeySettingTab } from './settings';
import { processImageBuffer } from './chroma-key';
import { ChromaKeyModal } from './ui/chroma-modal';

/** Map file extension to MIME type for canvas processing. */
export function extensionToMime(ext: string): string {
	switch (ext.toLowerCase()) {
		case 'png': return 'image/png';
		case 'jpg':
		case 'jpeg': return 'image/jpeg';
		case 'gif': return 'image/gif';
		case 'bmp': return 'image/bmp';
		case 'webp': return 'image/webp';
		default: return 'image/png';
	}
}

export default class ChromaKeyPlugin extends Plugin {
	settings!: ChromaKeySettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new ChromaKeySettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile)) return;
				if (!IMAGE_EXTENSIONS.includes(file.extension.toLowerCase())) return;

				menu.addItem((item) => {
					item
						.setTitle('Remove background')
						.setIcon('image-minus')
						.onClick(() => {
							this.openProcessingModal(file);
						});
				});
			}),
		);

		// Track folder renames so the chroma folder path stays current
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (!(file instanceof TFolder)) return;
				if (oldPath !== this.settings.chromaFolderPath) return;

				this.settings.chromaFolderPath = file.path;
				void this.saveSettings();
			}),
		);

		this.addCommand({
			id: 'remove-background',
			name: 'Remove background from image',
			checkCallback: (checking: boolean) => {
				// This command only works when an image embed is detected
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) return false;

				const cursor = view.editor.getCursor();
				const line = view.editor.getLine(cursor.line);
				const imageName = this.extractImageEmbed(line);
				if (!imageName) return false;

				if (!checking) {
					const imageFile = this.app.metadataCache.getFirstLinkpathDest(
						imageName,
						view.file?.path ?? '',
					);
					if (imageFile) {
						this.openProcessingModal(imageFile);
					} else {
						new Notice(`Could not find image: ${imageName}`);
					}
				}
				return true;
			},
		});
	}

	/**
	 * Extract image filename from an embed on a line, e.g. "![[photo.png]]" → "photo.png".
	 * Returns null if no image embed is found.
	 */
	private extractImageEmbed(line: string): string | null {
		const match = line.match(/!\[\[([^\]]+\.(png|jpe?g|gif|bmp|webp))\]\]/i);
		return match?.[1] ?? null;
	}

	private openProcessingModal(sourceFile: TFile): void {
		new ChromaKeyModal(this.app, sourceFile, this.settings, (result) => {
			const fullSettings: ChromaKeySettings = {
				...result,
				chromaFolderPath: this.settings.chromaFolderPath,
			};
			void this.processAndReplace(sourceFile, fullSettings);
		}).open();
	}

	/**
	 * Process an image: remove background, save to chroma/ folder,
	 * and replace the embed in the active editor.
	 */
	private async processAndReplace(
		sourceFile: TFile,
		settings: ChromaKeySettings,
	): Promise<void> {
		new Notice('Processing image background…');

		try {
			const buffer = await this.app.vault.readBinary(sourceFile);
			const mimeType = extensionToMime(sourceFile.extension);

			const processedBuffer = await processImageBuffer(buffer, mimeType, settings);

			const folderPath = this.settings.chromaFolderPath;
			const chromaFolder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!chromaFolder) {
				await this.app.vault.createFolder(folderPath);
			}

			const baseName = sourceFile.basename;
			const dateString = new Date()
				.toISOString()
				.replace(/[:.]/g, '-');
			const newFileName = `${baseName}-chroma-${dateString}.png`;
			const savePath = `${folderPath}/${newFileName}`;

			const newFile = await this.app.vault.createBinary(savePath, processedBuffer);

			// Replace the embed in the active editor
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				const editor = view.editor;
				const content = editor.getValue();

				// Handle both ![[name]] and ![[path/name]] formats
				const oldEmbed = `![[${sourceFile.name}]]`;
				const oldEmbedPath = `![[${sourceFile.path}]]`;
				const newEmbed = `![[${newFile.name}]]`;

				let updated = content;
				if (content.includes(oldEmbed)) {
					updated = content.replace(oldEmbed, newEmbed);
				} else if (content.includes(oldEmbedPath)) {
					updated = content.replace(oldEmbedPath, newEmbed);
				}

				if (updated !== content) {
					editor.setValue(updated);
				}
			}

			new Notice(`Background removed and saved to ${folderPath}/`);
		} catch (error) {
			console.error('Chroma Key Error:', error);
			new Notice('Failed to process image. Check the developer console for details.');
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<ChromaKeySettings> | null,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}