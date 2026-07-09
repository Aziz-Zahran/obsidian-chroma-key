import type { ChromaKeySettings, RGB } from './types';

/**
 * Parse a hex color string like "#FFFFFF" or "#FFF" into RGB components.
 */
function hexToRgb(hex: string): RGB {
	let cleaned = hex.replace('#', '');
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

function colorDistance(a: RGB, b: RGB): number {
	const dr = a.r - b.r;
	const dg = a.g - b.g;
	const db = a.b - b.b;
	return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
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
export function applyChromaKey(imageData: ImageData, settings: ChromaKeySettings): void {
	const data = imageData.data;
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

	const pixelCount = data.length / 4;

	const maxDistance = 441.67;
	const threshold = (settings.tolerance / 100) * maxDistance;
	const softStart = threshold * 0.7;

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

	if (settings.invertColors) {
		for (let i = 0; i < pixelCount; i++) {
			const offset = i * 4;
			if (data[offset + 3]! > 0) {
				data[offset] = 255 - data[offset]!;
				data[offset + 1] = 255 - data[offset + 1]!;
				data[offset + 2] = 255 - data[offset + 2]!;
			}
		}
	}
}

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
	applyChromaKey(imageData, settings);

	ctx.putImageData(imageData, 0, 0);

	return canvasToArrayBuffer(canvas);
}

export async function processImageBuffer(
	buffer: ArrayBuffer,
	mimeType: string,
	settings: ChromaKeySettings,
): Promise<ArrayBuffer> {
	const blob = new Blob([buffer], { type: mimeType });
	const img = await loadImageFromBlob(blob);
	return processImageElement(img, settings);
}
