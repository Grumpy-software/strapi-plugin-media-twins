# Media Twins

**Strapi 5 plugin** that finds exact duplicate media, similar images, and unused Media Library files — then lets you reassign references or delete leftovers without silent data loss.

> Strapi `^5.0.0` only. Not compatible with Strapi v4.

Exact duplicates are grouped by **SHA-256 of file bytes**, not filename. Similar images use **pHash and dHash** with a configurable Hamming-distance threshold. Unused detection covers morph relations (including components and dynamic zones) **and** soft references inside rich-text / Blocks (url or hash in text).

## Features

- **Exact duplicates** — cryptographic hash of the original file bytes
- **Similar images** — perceptual hashes; resized, recompressed, or lightly cropped copies match
- **Unused / orphans** — no morph row and no inline url/hash in rich-text or Blocks
- **Reassign** — pick a canonical file, rewrite relations + inline refs, verify, then delete extras (and their formats) through the upload service
- **Delete** — only after a pre-delete scan shows the file is unreferenced
- **Dry-run / preview** before apply
- **Ignore-list** for a file or an entire folder
- **Role-based permissions**: see / configure / reassign / delete
- Native Media Library look (grid and list, real previews)

Video **similarity** is out of v1 (decode cost). Videos still appear in exact-duplicate and unused results.

## Install

```bash
npm install strapi-plugin-media-twins
```

Enable the plugin:

```ts
// config/plugins.ts
export default () => ({
  'media-twins': {
    enabled: true,
    config: {
      similarityThreshold: 10, // Hamming distance, 0–64
      similarSkipExact: true,
      deepScanDefault: true,
    },
  },
});
```

Local path (this repo, after `npm run build`):

```ts
export default () => ({
  'media-twins': {
    enabled: true,
    resolve: '../strapi-plugin-media-twins',
    config: {
      similarityThreshold: 10,
    },
  },
});
```

Rebuild the admin panel (`npm run build` / `npm run develop` in the Strapi app). Grant the new permissions under **Settings → Administration panel → Roles**.

## Configuration

| Option | Default | Meaning |
| --- | --- | --- |
| `similarityThreshold` | `10` | Inclusive Hamming distance on 64-bit pHash **or** dHash. `10` is the sensible default for resize / recompress / light crop. |
| `similarSkipExact` | `true` | Hide similar groups that are already listed as exact SHA-256 twins. |
| `deepScanDefault` | `true` | Unused scan also searches text / rich-text / Blocks columns for each file's hash and url. |

You can also change the threshold from **Settings → Media Twins** (requires the configure permission). Store overlay wins over file defaults.

## Usage

1. Open **Media Twins** in the admin sidebar.
2. Click **Scan**. Tabs show Exact duplicates, Similar images, and Unused.
3. In a duplicate/similar group, keep the suggested canonical or **Set as canonical**.
4. Click **Preview reassign**. The preview lists morph rows and inline fields that would change, and which extras would be deleted.
5. **Apply** rewrites references, verifies extras are unreferenced, then deletes extras via the upload service (original + thumbnails/formats).
6. On Unused, select files and **Preview delete**. Apply is refused if anything is still referenced.

Ignored files and folders stay out of results unless **Show ignored** is on.

## Permissions

| Action | What it allows |
| --- | --- |
| See Media Twins | Open the plugin and run a scan |
| Configure Media Twins | Threshold + ignore-list |
| Reassign duplicate media | Preview and apply reassign |
| Delete unused or extra media | Preview and apply delete |

## Safety

Deletes are **two-phase**: rewrite → verify → delete. If verify still finds a reference, extras are **not** deleted and the API returns `409` with `code: STILL_REFERENCED`. There is no silent data loss.

See [DESIGN.md](./DESIGN.md) for algorithms, the morph table (`files_related_mph`), Blocks soft-refs, and the test plan.

## Develop

```bash
npm install
npm test
npm run build
npm run verify
```

`npm test` covers hash grouping, similarity threshold, orphan detection including a Blocks soft-ref, reassign rewrite + verify, and delete refused when still referenced.

## Marketplace

Package name: `strapi-plugin-media-twins`  
Plugin id: `media-twins`  
License: MIT
