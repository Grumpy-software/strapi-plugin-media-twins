import { DEFAULT_CONFIG, type PluginRuntimeConfig } from '../engine/types';

export default {
  default: { ...DEFAULT_CONFIG },
  validator(config: PluginRuntimeConfig) {
    if (config.similarityThreshold != null) {
      const value = Number(config.similarityThreshold);
      if (!Number.isInteger(value) || value < 0 || value > 64) {
        throw new Error('media-twins.similarityThreshold must be an integer between 0 and 64');
      }
    }
  },
};
