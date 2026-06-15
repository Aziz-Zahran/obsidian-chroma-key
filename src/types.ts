/**
 * RGB color representation with values 0–255 per channel.
 */
export interface RGB {
	r: number;
	g: number;
	b: number;
}

/**
 * Plugin settings persisted via Obsidian's loadData/saveData.
 * These serve as defaults for the processing modal.
 */
export interface ChromaKeySettings {
	/** Hex color string to remove, e.g. "#FFFFFF". */
	targetColor: string;
	/** Color-distance tolerance 0–100. Higher = more aggressive removal. */
	tolerance: number;
	/** If true, sample the top-left pixel instead of using targetColor. */
	autoDetectColor: boolean;
	/** If true, apply smooth alpha falloff at background edges. */
	edgeSoftening: boolean;
	/** Vault path where processed images are saved. Tracked across renames. */
	chromaFolderPath: string;
}

export const DEFAULT_SETTINGS: ChromaKeySettings = {
	targetColor: '#FFFFFF',
	tolerance: 30,
	autoDetectColor: true,
	edgeSoftening: true,
	chromaFolderPath: 'chroma',
};

/** Image file extensions that the plugin can process. */
export const IMAGE_EXTENSIONS = [
	'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp',
];
