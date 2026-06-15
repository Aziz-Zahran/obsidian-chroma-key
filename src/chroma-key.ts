import type { ChromaKeySettings, RGB } from './types';

/**
 * Parse a hex color string like "#FFFFFF" or "#FFF" into RGB components.
 */
function hexToRgb(hex: string): RGB {
	let cleaned = hex.replace('#', '');
	// Expand shorthand "#FFF" → "FFFFFF"
	if (cleaned.length === 3) {
		cleaned = cleaned[0]! + cleaned[0]! + cleaned[1]! + cleaned[1]! + cleaned[2]! + cleaned[2]!;
	}
	const num = parseInt(cleaned, 16);
	return {
		r: (num >> 16) & 0xFF,
		g: (num >> 8) & 0xFF,
		b: num & 0xFF,
	};
}

/**
 * Compute the Euclidean color distance between two RGB colors.
 * Max possible distance is ~441.67 (black to white).
 */
function colorDistance(a: RGB, b: RGB): number {
	const dr = a.r - b.r;
	const dg = a.g - b.g;
	const db = a.b - b.b;
	return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Load a Blob into an HTMLImageElement.
 */
function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = (_e) => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load image'));
		};
		img.src = url;
	});
}

/**
 * Convert a canvas to an ArrayBuffer containing PNG data.
 */
function canvasToArrayBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error('Canvas toBlob returned null'));
				return;
			}
			blob.arrayBuffer().then(resolve, reject);
		}, 'image/png');
	});
}

/**
 * Core chroma key processing on an HTMLImageElement.
 * Removes the target background color and returns a transparent PNG ArrayBuffer.
 */
function processImageElement(
	img: HTMLImageElement,
	settings: ChromaKeySettings,
): Promise<ArrayBuffer> {
	const canvas = activeDocument.createElement('canvas');
	canvas.width = img.width;
	canvas.height = img.height;

	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('Could not get 2D canvas context');
	}

	ctx.drawImage(img, 0, 0);

	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const data = imageData.data;

	// Determine the target color to remove
	let target: RGB;
	if (settings.autoDetectColor) {
		target = {
			r: data[0]!,
			g: data[1]!,
			b: data[2]!,
		};
	} else {
		target = hexToRgb(settings.targetColor);
	}

	// Scale tolerance: 0–100 maps to color distance 0–441.67
	const maxDistance = 441.67;
	const threshold = (settings.tolerance / 100) * maxDistance;
	const softStart = threshold * 0.7;

	const pixelCount = data.length / 4;
	for (let i = 0; i < pixelCount; i++) {
		const offset = i * 4;
		const pixel: RGB = {
			r: data[offset]!,
			g: data[offset + 1]!,
			b: data[offset + 2]!,
		};

		const dist = colorDistance(pixel, target);

		if (dist < softStart) {
			data[offset + 3] = 0;
		} else if (settings.edgeSoftening && dist < threshold) {
			const originalAlpha = data[offset + 3]!;
			const factor = (dist - softStart) / (threshold - softStart);
			data[offset + 3] = Math.round(originalAlpha * factor);
		}
	}

	ctx.putImageData(imageData, 0, 0);

	return canvasToArrayBuffer(canvas);
}

/**
 * Process an image from an ArrayBuffer (read from the vault).
 * Returns a transparent PNG as an ArrayBuffer.
 */
export async function processImageBuffer(
	buffer: ArrayBuffer,
	mimeType: string,
	settings: ChromaKeySettings,
): Promise<ArrayBuffer> {
	const blob = new Blob([buffer], { type: mimeType });
	const img = await loadImageFromBlob(blob);
	return processImageElement(img, settings);
}
