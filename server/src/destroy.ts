import type { Core } from '@strapi/strapi';

const destroy = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.log.debug('[media-twins] destroy');
};

export default destroy;
