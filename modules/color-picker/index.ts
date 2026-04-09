import ColorPickerModule from './src/ColorPickerModule';

export type { PixelColor } from './src/ColorPickerModule';

export async function getPixelColor(imagePath: string, x: number, y: number, displayWidth: number, displayHeight: number) {
  return await ColorPickerModule.getPixelColor(imagePath, x, y, displayWidth, displayHeight);
}
