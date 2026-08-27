const see = ['plugin::media-twins.see'];
const configure = ['plugin::media-twins.configure'];
const reassign = ['plugin::media-twins.reassign'];
const remove = ['plugin::media-twins.delete'];

function withPermissions(actions: string[]) {
  return [
    {
      name: 'admin::hasPermissions',
      config: { actions },
    },
  ];
}

export default {
  type: 'admin' as const,
  routes: [
    {
      method: 'GET',
      path: '/config',
      handler: 'twins.config',
      config: { policies: withPermissions(see) },
    },
    {
      method: 'PUT',
      path: '/config',
      handler: 'twins.updateConfig',
      config: { policies: withPermissions(configure) },
    },
    {
      method: 'POST',
      path: '/scan',
      handler: 'twins.scan',
      config: { policies: withPermissions(see) },
    },
    {
      method: 'POST',
      path: '/reassign/preview',
      handler: 'twins.previewReassign',
      config: { policies: withPermissions(reassign) },
    },
    {
      method: 'POST',
      path: '/reassign',
      handler: 'twins.reassign',
      config: { policies: withPermissions(reassign) },
    },
    {
      method: 'POST',
      path: '/delete/preview',
      handler: 'twins.previewDelete',
      config: { policies: withPermissions(remove) },
    },
    {
      method: 'POST',
      path: '/delete',
      handler: 'twins.delete',
      config: { policies: withPermissions(remove) },
    },
    {
      method: 'GET',
      path: '/ignore',
      handler: 'twins.listIgnore',
      config: { policies: withPermissions(see) },
    },
    {
      method: 'POST',
      path: '/ignore',
      handler: 'twins.addIgnore',
      config: { policies: withPermissions(configure) },
    },
    {
      method: 'DELETE',
      path: '/ignore/:id',
      handler: 'twins.removeIgnore',
      config: { policies: withPermissions(configure) },
    },
  ],
};
