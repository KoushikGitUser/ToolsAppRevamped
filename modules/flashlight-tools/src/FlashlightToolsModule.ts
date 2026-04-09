import { NativeModule, requireNativeModule } from 'expo';

declare class FlashlightToolsModule extends NativeModule {
  hasFlash(): boolean;
  turnOn(): void;
  turnOff(): void;
  isOn(): boolean;
  getMaxBrightness(): number;
  setBrightness(level: number): void;
}

export default requireNativeModule<FlashlightToolsModule>('FlashlightTools');
