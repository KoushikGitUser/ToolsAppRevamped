import { NativeModule, requireNativeModule } from 'expo';

export interface PixelColor {
  r: number;
  g: number;
  b: number;
  a: number;
  hex: string;
}

declare class ColorPickerModule extends NativeModule {
  getPixelColor(imagePath: string, x: number, y: number, displayWidth: number, displayHeight: number): Promise<PixelColor>;
}

export default requireNativeModule<ColorPickerModule>('ColorPicker');
