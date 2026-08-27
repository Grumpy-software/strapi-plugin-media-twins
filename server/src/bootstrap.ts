import type { Core } from '@strapi/strapi';

import { ACTIONS } from './constants';

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  await strapi.admin.services.permission.actionProvider.registerMany(ACTIONS);
};

export default bootstrap;
