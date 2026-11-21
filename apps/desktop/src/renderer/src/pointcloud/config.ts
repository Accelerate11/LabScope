import type { SourceId } from '../workspace/message-bus';
import { COLOR_MODES, MAX_LAYER_POINTS, SAMPLING_MODES, type ProcessingOptions } from './processor';
import { hexColor, validSceneSettings, type SceneSettings } from '../spatial/scene-settings';

export interface LayerStyle extends ProcessingOptions {
  visible: boolean;
  pointSize: number;
  displayName?: string;
}

export interface OverlayConfig extends LayerStyle {
  source: SourceId;
  topic: string;
}

export interface PointCloudConfig {
  primary: LayerStyle;
  overlays: OverlayConfig[];
  scene?: SceneSettings;
}

export const MAX_CLOUD_LAYERS = 3;
export const DEFAULT_LAYER_STYLE: LayerStyle = {
  colorMode: 'height', sampling: 'uniform', maxPoints: 100_000, pointSize: 2, visible: true,
};

export function validPointCloudConfig(value: unknown): value is PointCloudConfig {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as PointCloudConfig;
  function validStyle(style: LayerStyle): boolean {
    const validRange = (range: unknown) => range === undefined || (Array.isArray(range) &&
      range.length === 2 && range.every((n) => typeof n === 'number' && Number.isFinite(n)) && range[0] < range[1]);
    return !!style && COLOR_MODES.includes(style.colorMode) && SAMPLING_MODES.includes(style.sampling) &&
      Number.isInteger(style.maxPoints) && style.maxPoints >= 1 && style.maxPoints <= MAX_LAYER_POINTS &&
      Number.isFinite(style.pointSize) && style.pointSize >= 1 && style.pointSize <= 12 && typeof style.visible === 'boolean' &&
      (style.fixedColor === undefined || hexColor(style.fixedColor)) && validRange(style.intensityRange) &&
      validRange(style.heightRange) && (style.displayName === undefined ||
        (typeof style.displayName === 'string' && style.displayName.length <= 80));
  }
  return validStyle(config.primary) && Array.isArray(config.overlays) && config.overlays.length < MAX_CLOUD_LAYERS &&
    (config.scene === undefined || validSceneSettings(config.scene)) &&
    config.overlays.every((entry) => validStyle(entry) && ['live', 'simulation', 'playback'].includes(entry.source) &&
      typeof entry.topic === 'string' && entry.topic.startsWith('/') && entry.topic.length <= 256);
}
