import FlashlightToolsModule from './src/FlashlightToolsModule';

export function hasFlash(): boolean {
  return FlashlightToolsModule.hasFlash();
}

export function turnOn(): void {
  FlashlightToolsModule.turnOn();
}

export function turnOff(): void {
  FlashlightToolsModule.turnOff();
}

export function isOn(): boolean {
  return FlashlightToolsModule.isOn();
}

export function getMaxBrightness(): number {
  return FlashlightToolsModule.getMaxBrightness();
}

export function setBrightness(level: number): void {
  FlashlightToolsModule.setBrightness(level);
}
