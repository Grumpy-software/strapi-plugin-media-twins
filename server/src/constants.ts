export const PLUGIN_ID = 'media-twins';
export const PLUGIN_UID = 'plugin::media-twins';
export const FILE_UID = 'plugin::upload.file';
export const FOLDER_UID = 'plugin::upload.folder';
export const IGNORE_UID = 'plugin::media-twins.ignore-entry';
export const FINGERPRINT_UID = 'plugin::media-twins.file-fingerprint';

export const ACTIONS = [
  {
    section: 'plugins',
    displayName: 'See Media Twins',
    uid: 'see',
    pluginName: PLUGIN_ID,
  },
  {
    section: 'plugins',
    displayName: 'Configure Media Twins',
    uid: 'configure',
    pluginName: PLUGIN_ID,
  },
  {
    section: 'plugins',
    displayName: 'Reassign duplicate media',
    uid: 'reassign',
    pluginName: PLUGIN_ID,
  },
  {
    section: 'plugins',
    displayName: 'Delete unused or extra media',
    uid: 'delete',
    pluginName: PLUGIN_ID,
  },
] as const;
