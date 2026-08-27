import type { Core } from '@strapi/strapi';

import { StillReferencedError } from '../engine/types';

const twins = ({ strapi }: { strapi: Core.Strapi }) => ({
  async config(ctx: any) {
    ctx.body = await strapi.plugin('media-twins').service('twins').getConfig();
  },

  async updateConfig(ctx: any) {
    ctx.body = await strapi.plugin('media-twins').service('twins').saveConfig(ctx.request.body ?? {});
  },

  async scan(ctx: any) {
    ctx.body = await strapi.plugin('media-twins').service('twins').scan(ctx.request.body ?? {});
  },

  async previewReassign(ctx: any) {
    const { canonicalId, extraIds } = ctx.request.body ?? {};
    ctx.body = await strapi.plugin('media-twins').service('twins').previewReassign(Number(canonicalId), asIdList(extraIds));
  },

  async reassign(ctx: any) {
    const { canonicalId, extraIds } = ctx.request.body ?? {};
    ctx.body = await strapi.plugin('media-twins').service('twins').applyReassign(Number(canonicalId), asIdList(extraIds));
  },

  async previewDelete(ctx: any) {
    const { fileIds } = ctx.request.body ?? {};
    ctx.body = await strapi.plugin('media-twins').service('twins').previewDelete(asIdList(fileIds));
  },

  async delete(ctx: any) {
    try {
      const { fileIds } = ctx.request.body ?? {};
      ctx.body = await strapi.plugin('media-twins').service('twins').applyDelete(asIdList(fileIds));
    } catch (error) {
      if (error instanceof StillReferencedError) {
        ctx.status = 409;
        ctx.body = { code: error.code, message: error.message, files: error.files };
        return;
      }
      throw error;
    }
  },

  async listIgnore(ctx: any) {
    ctx.body = await strapi.plugin('media-twins').service('twins').listIgnore();
  },

  async addIgnore(ctx: any) {
    ctx.body = await strapi.plugin('media-twins').service('twins').addIgnore(ctx.request.body ?? {});
  },

  async removeIgnore(ctx: any) {
    await strapi.plugin('media-twins').service('twins').removeIgnore(Number(ctx.params.id));
    ctx.body = { ok: true };
  },
});

function asIdList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
}

export default twins;
