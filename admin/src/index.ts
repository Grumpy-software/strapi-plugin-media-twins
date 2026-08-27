import { Initializer } from './components/Initializer';
import { PluginIcon } from './components/PluginIcon';
import pluginPermissions from './permissions';
import { PLUGIN_ID } from './pluginId';
import { getTranslation } from './utils/getTranslation';

export default {
  register(app: any) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: PluginIcon,
      intlLabel: {
        id: getTranslation('plugin.name'),
        defaultMessage: 'Media Twins',
      },
      Component: async () => {
        const { App } = await import('./pages/App');
        return App;
      },
      permissions: pluginPermissions.see,
    });

    app.addSettingsLink('global', {
      intlLabel: {
        id: getTranslation('settings.title'),
        defaultMessage: 'Media Twins',
      },
      id: PLUGIN_ID,
      to: PLUGIN_ID,
      Component: async () => {
        const { SettingsPage } = await import('./pages/SettingsPage');
        return SettingsPage;
      },
      permissions: pluginPermissions.configure,
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  async registerTrads({ locales }: { locales: string[] }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(`./translations/${locale}.json`);
          return { data: prefixPluginTranslations(data, PLUGIN_ID), locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  },
};

function prefixPluginTranslations(data: Record<string, string>, pluginId: string) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [`${pluginId}.${key}`, value]));
}
