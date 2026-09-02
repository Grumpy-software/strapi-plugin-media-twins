# Media Twins - Design

Marketplace plugin **`strapi-plugin-media-twins`** for **Strapi 5 only** (`^5.0.0`).
Plugin id: **`media-twins`**. Admin section: **Media Twins**.

This document is the source of truth for architecture, data model, algorithms, admin UX, safety, tests, and packaging. Implementation must match it.

---

## 1. Problem

The Media Library accumulates:

1. **Exact duplicates** - the same bytes uploaded more than once (often under different names).
2. **Similar images** - resized, recompressed, or slightly cropped copies that look the same.
3. **Orphans** - files referenced nowhere, including media pasted into rich-text / Blocks (no morph row).

Operators need to **see groups**, **preview** a rewrite, **reassign** references to one canonical file, and **delete** leftovers - without silent data loss.

v1 is **images-first**. Video **similarity** is out of scope (expensive decode + keyframes). Videos still participate in **exact** (SHA-256) and **unused** scans.

---

## 2. Research notes (what is true in Strapi 5)

Discarded guesses are called out.

| Topic | Fact |
| --- | --- |
| Plugin layout | Official Plugin SDK layout: `admin/src`, `server/src`, `package.json` exports `./strapi-admin` and `./strapi-server` (not `./admin` / `./server`). |
| Plugin id | Derived from package name by stripping `strapi-plugin-` → `media-twins`. `strapi.name` in `package.json` is `media-twins`. |
| Upload file UID | `plugin::upload.file`. Table `files`. |
| `files.hash` | **Not** a content hash. It is a **random filename token** from `image-manipulation.generateFileName()`. Used in stored paths (`/uploads/{hash}{ext}`) and in Blocks `image.hash`. |
| Exact duplicates | Must hash **file bytes** (SHA-256). Filename / `files.hash` are irrelevant. |
| Morph table | Media relations (including components and dynamic zones) live in a polymorphic join table. Strapi 5 names it **`files_related_mph`**. Older / some docs still say `files_related_morphs`. Resolve at runtime via `strapi.db.metadata` first, then table-name fallback. Typical columns: `file_id`, `related_id`, `related_type`, `field`, `order`. |
| Soft references | `richtext` (markdown) and `blocks` store media **inline** (url and/or `hash`). They create **no** morph row. A morph-only unused scan is wrong. |
| Blocks image node | `{ type: 'image', image: { url, hash, name, ext, mime, size, width, height, formats, … }, children: […] }`. `image` is a `plugin::upload.file` snapshot. |
| Delete | `strapi.plugin('upload').service('upload').remove(file)` with the **full file object**. That deletes provider bytes, **formats/thumbnails**, then the `files` row. Passing only `{ id }` is unsafe / incomplete. |
| Permissions | Register with `strapi.admin.services.permission.actionProvider.registerMany` in `bootstrap`. Protect admin routes with `admin::hasPermissions`. Protect pages with `<Page.Protect>` + `useRBAC`. Menu `permissions` only hide the link. |
| Admin HTTP | `useFetchClient()` / `getFetchClient()` from `@strapi/strapi/admin`. |
| Design system | `@strapi/design-system` + `@strapi/icons` + `@strapi/strapi/admin` (`Page`, layouts). Native Media Library look - not a custom design system. |
| Local TS plugin | Node loads `strapi-server` as JS. Published / path-installed plugins must ship **built** `dist/` (or a JS entry). Admin TS is compiled by the host admin build when using `source`, and by the plugin build for publishing. |

Existing plugins used as **behavioural references**, not source copies:

- **PaulRichez/strapi-plugin-unused-media** - morph scan + deep text/hash scan + ignore-list + delete via upload service + native ML look.
- **strapi-plugin-media-usage** - `files_related_mph` + BFS up `*_cmps` to parent entries (we reuse the morph table, not the CM injection).
- **duplicate-analyzer** class plugins - filename-based grouping is **wrong** for this product; we use cryptographic + perceptual hashes.

---

## 3. Architecture

```
admin/          Strapi Design System UI (scan, groups, preview, ignore, settings)
server/         Admin routes + controllers + RBAC + content-types
  engine/       Pure, testable algorithms (no Strapi import)
  adapters/     Strapi I/O: files, morph table, text columns, upload.remove, store
```

The **engine** receives plain data and returns plans. The **adapter** reads/writes Strapi. Tests hit the engine with fixtures; adapters are thin.

### 3.1 Runtime flow

1. Admin calls `POST /scan` (or `GET` with query) → adapter loads files + ignore-list + morph ids + optional fingerprints.
2. Adapter computes missing fingerprints (SHA-256 / pHash / dHash), persists cache.
3. Engine groups exact + similar; unused = files with no morph row **and** (if deep) no soft ref.
4. Admin shows tabs. User picks a canonical + extras (or unused ids).
5. `POST /reassign/preview` or `/delete/preview` → engine builds a **Plan** (dry-run).
6. Apply: rewrite morph + inline → **verify extras unreferenced** → only then `upload.remove`.

### 3.2 Scan is synchronous in v1

v1 runs the scan in the request. Fingerprints are cached so repeats are cheap. No job queue. Large libraries may take seconds; the UI shows a loading state. A later version can add a progress job.

---

## 4. Data model

### 4.1 Plugin configuration (`config/plugins.ts` → `plugin::media-twins`)

```ts
{
  similarityThreshold: 10,   // Hamming distance, inclusive. Integer 0-64.
  similarSkipExact: true,    // exact groups are not also listed as similar
  deepScanDefault: true,     // unused scan includes rich-text / Blocks
}
```

Validated on boot. Defaults above. Threshold default **10** on 64-bit pHash/dHash: catches resize / recompress / light crop; avoids “everything is similar”.

### 4.2 Content-types (hidden from Content Manager / CTB)

**`plugin::media-twins.ignore-entry`** (`media_twins_ignores`)

| Attribute | Type | Purpose |
| --- | --- | --- |
| `kind` | enum `file` \| `folder` | What is ignored |
| `fileId` | integer | Upload file id when `kind=file` |
| `folderId` | integer | Upload folder id when `kind=folder` |
| `folderPath` | string | Snapshot of `folderPath` (prefix match, e.g. `/brand`) |
| `label` | string | Display name |

A file is ignored if its id is listed **or** its `folderPath === ignoredPath` **or** `folderPath.startsWith(ignoredPath + '/')`.

**`plugin::media-twins.file-fingerprint`** (`media_twins_fingerprints`)

| Attribute | Type | Purpose |
| --- | --- | --- |
| `fileId` | integer, unique | `files.id` |
| `sha256` | string | Hex SHA-256 of original bytes |
| `phash` | string | 16-char hex (64-bit) or empty if not an image |
| `dhash` | string | 16-char hex (64-bit) or empty if not an image |
| `byteSize` | biginteger | Bytes hashed |
| `sourceUpdatedAt` | datetime | `files.updatedAt` at compute time |

Invalidate when `files.updatedAt !== sourceUpdatedAt` or the file is missing.

Draft & publish: **off**. Both types `pluginOptions.content-manager/content-type-builder.visible = false`.

### 4.3 Upload / morph (read-only from our side except rewrites)

- Files: `id`, `documentId`, `name`, `hash`, `url`, `ext`, `mime`, `size`, `width`, `height`, `formats`, `folderPath`, `updatedAt`, `alternativeText`, `caption`, `provider`.
- Morph rows: `{ fileId, relatedId, relatedType, field, order }`.
- Soft-ref tokens per file: `hash`, `url`, each format’s `hash`/`url`, and the basename of `url`.

---

## 5. Algorithms

### 5.1 Exact duplicates

1. Read original file bytes via the upload provider (`getStream` / local public file). **Do not** hash thumbnails.
2. `sha256 = SHA-256(bytes)` hex.
3. Group files that share the same `sha256` and have **count ≥ 2**.
4. Sort each group: largest `size` first, then oldest `id` (stable canonical suggestion).

Non-images (PDF, video, …) are included.

### 5.2 Similar images (pHash + dHash)

**In scope:** `mime` starts with `image/` and sharp can decode it.

**Out of scope (v1):** video perceptual similarity. Videos never enter similar groups.

**pHash (64-bit)**

1. Decode with `sharp`, rotate via EXIF, greyscale, resize **32×32** (no aspect preserve).
2. 2D DCT (type-II) on the 32×32 matrix.
3. Take the **8×8** low-frequency block **excluding** DC `[0][0]`.
4. Threshold vs the **median** of those 63 values → 64 bits (DC bit forced 0).
5. Emit 16 hex chars.

**dHash (64-bit)**

1. Greyscale, resize **9×8**.
2. For each of 8 rows, 8 comparisons `pixel[x] > pixel[x+1]`.
3. 16 hex chars.

**Distance:** Hamming (popcount of XOR). Two images are **similar** if

```
hamming(phashA, phashB) <= threshold
  OR
hamming(dhashA, dhashB) <= threshold
```

Either hash matching is enough so a crop that breaks one still hits the other.

**Clustering:** union-find over all image pairs that pass the test. Groups with size ≥ 2 are returned.

**Flat images:** a solid-color canvas yields an all-zero pHash and dHash (no AC energy / no adjacent contrast). Those hashes are **not** used for similar pairing - otherwise every empty rectangle would cluster. They still participate in exact SHA-256 groups.

If `similarSkipExact` is true, drop groups whose every member shares one SHA-256 (already shown under Exact). A mixed group (exact twins + a resized cousin) stays under Similar.

Suggested canonical: largest pixel area (`width * height`), then largest `size`, then smallest `id`.

### 5.3 Orphans / unused (deep scan)

A file is **referenced** if any of:

1. **Morph:** a row in the resolved files-related join table has `file_id = file.id`. This covers media fields on documents, components, and dynamic zones (components have their own `related_id` / `related_type`).
2. **Soft ref:** any text-like cell contains a token of the file (`hash`, `url`, format hash/url).

**Deep scan procedure** (same idea as unused-media; implemented here, not copied):

1. Candidate set = all files minus morph-referenced ids minus ignored.
2. Discover text-like columns: walk `strapi.contentTypes` and `strapi.components`. Include attribute types `string`, `text`, `richtext`, `blocks`, `json`. Skip plugin internals (`admin::`, `plugin::i18n`, `plugin::users-permissions`, our own types, upload file/folder).
3. For each table/column, `SELECT id, column FROM table WHERE column IS NOT NULL` (or batched). Coerce JSON to string. Test whether the blob contains any candidate token.
4. Hits are **referenced** (not unused).

Always run the same reference check as a **pre-delete safety net**, even if the UI skipped deep scan.

### 5.4 Reassign

Input: `canonicalId`, `extraIds[]` (canonical ∉ extras).

**Phase A - rewrite (dry-run builds the same plan without writes)**

1. **Morph:** for each extra row:
   - If a row already exists for `(canonicalId, related_id, related_type, field)`, delete the extra row (avoid unique / duplicate media).
   - Else `UPDATE` `file_id` extra → canonical (keep `order`).
2. **Soft refs:** for every text-like cell that contains an extra token:
   - String / richtext: replace extra `url` → canonical `url`, extra `hash` → canonical `hash`. Prefer longest tokens first (format urls before hash) to avoid partial clobber.
   - Blocks / JSON: walk the tree; if a node looks like a file snapshot (`hash` + `url`) matching an extra, replace with the canonical snapshot (id, documentId, hash, url, name, ext, mime, size, width, height, formats, …). Then still run string replace on serialized leftovers.

**Phase B - verify**

Re-run morph + deep-scan **only for extras**. If any extra is still referenced → **do not delete**. Return `{ rewritten: true, deleted: false, blocked: [...] }`. Content already points at the canonical; leftovers remain until a retry or manual delete.

**Phase C - delete**

`upload.remove(fullFile)` for each extra. Provider deletes original + `formats`. Fingerprint rows for those ids are removed.

Never delete the canonical. Never delete a file that failed verify.

### 5.5 Delete unused

1. Resolve ignore-list (refuse ignored ids).
2. Full reference check (morph + deep).
3. If any selected file is referenced → **refuse all or refuse those** (v1: refuse the referenced ones, delete the rest, report both). Preference: **refuse the whole batch** if any selected id is referenced, so the preview matches apply. **Decision: refuse the whole batch** when any id is still referenced. Preview must show that.
4. Otherwise `upload.remove` each.

### 5.6 Ignore-list

Excluded from Exact, Similar, and Unused result sets. `Show ignored` (configure permission) lists them without actions except “Restore”. Ignoring a folder hides every file whose `folderPath` is that path or a descendant.

---

## 6. Admin API

All routes are **admin** (`type: 'admin'`), authenticated, namespaced `/media-twins`.

| Method | Path | Permission | Purpose |
| --- | --- | --- |
| GET | `/config` | `see` | Effective config |
| PUT | `/config` | `configure` | Persist threshold override in plugin store (optional; file config wins if set - v1: store overlay) |
| POST | `/scan` | `see` | Body: `{ types?: ['exact','similar','unused'], deep?: boolean }` |
| POST | `/reassign/preview` | `reassign` | Plan only |
| POST | `/reassign` | `reassign` | Apply rewrite + verify + delete extras |
| POST | `/delete/preview` | `delete` | Plan only |
| POST | `/delete` | `delete` | Verify then remove |
| GET | `/ignore` | `see` | List ignore entries |
| POST | `/ignore` | `configure` | Add file or folder |
| DELETE | `/ignore/:id` | `configure` | Restore |

**RBAC actions** (section `plugins`, `pluginName: 'media-twins'`):

| uid | displayName |
| --- | --- |
| `see` | See Media Twins |
| `configure` | Configure Media Twins |
| `reassign` | Reassign duplicate media |
| `delete` | Delete unused or extra media |

Super Admin receives them via Strapi’s usual action sync.

---

## 7. Admin UX

Native Media Library language - not a marketing landing page.

- Sidebar: **Media Twins** with a picture/landscape icon (same weight as Media Library).
- Page header: title, subtitle (library size vs reclaimable), primary **Scan**.
- Tabs: **Exact duplicates** - **Similar images** - **Unused**.
- Toolbar: grid / list toggle, “Show ignored”, search by filename, Hamming threshold hint on Similar.
- **Cards** reuse ML patterns: square preview (`url` or format thumbnail), filename, size, folder path, mime badge. Checkbox for bulk.
- **Groups:** one card row per group; radio / “Set as canonical” on one file; extras selected by default except canonical.
- **Preview** modal before apply: counts of morph rows, inline fields, files that would be deleted; explicit “Dry run” vs “Apply”.
- Empty: “No exact duplicates in this library.” / “No similar images at this threshold.” / “No unused files.”
- Loading: `Loader` + “Scanning media…”.
- Error: `Alert` with the server message (e.g. delete refused because still referenced).
- Settings link (configure): threshold number input, ignore-list table.
- Desktop: multi-column grid. Mobile: single column, stacked toolbars.

Copy is **English**. No lorem. No “Welcome to your app.”

---

## 8. Safety

1. **Two-phase delete:** rewrite → verify unreferenced → delete. No delete on failed verify.
2. **Preview ≠ apply.** Apply re-computes the plan; it does not trust a stale preview.
3. **No silent skip.** Refused deletes return HTTP 409 with `{ code: 'STILL_REFERENCED', files: [...] }`.
4. **Canonical protection:** extras only.
5. **Ignore-list** files are not in destructive default selections.
6. **Upload service only** for disk/DB file removal (formats included).
7. **No secrets** in repo. No PAT. No telemetry.

Transactions: Strapi document + provider I/O do not share one trx reliably. Two-phase is the safety net, not a pretend SQL transaction around `upload.remove`.

---

## 9. Test plan

Runner: **Vitest**. Engine tests are pure (no Strapi). Adapter-shaped functions that take injected repos are unit-tested with fakes.

| Case | Assert |
| --- | --- |
| Hash grouping | Same SHA-256 → one group; different → none; singleton omitted |
| Similarity threshold | Dist 8 + threshold 10 → grouped; dist 12 → not; threshold 0 only exact-perceptual |
| Orphan + Blocks soft-ref | File with no morph row but `hash` inside a Blocks image node is **referenced**; a file with neither morph nor token is unused |
| Reassign rewrite + verify | Morph `file_id` and Blocks `image.hash`/`url` become canonical; extras then verify clean |
| Delete refused | `deleteFiles` throws / returns blocked when a fake repo still reports a reference |

No live S3. Image hashes in tests use tiny generated PNGs (or precomputed matrices for DCT) so CI needs no network.

---

## 10. Package / marketplace packaging

- Name: `strapi-plugin-media-twins`
- `strapi.kind`: `plugin`
- `strapi.name`: `media-twins`
- `strapi.displayName`: `Media Twins`
- Keywords include `strapi` and `plugin`
- `peerDependencies["@strapi/strapi"]`: `^5.0.0`
- Exports: `./strapi-admin` and `./strapi-server` with key order **`types`, `source`, `import`, `require`, `default`**
- Scripts: `build` / `watch` / `verify` via `@strapi/sdk-plugin`, `test` via vitest
- `files`: `dist`, README, DESIGN, LICENSE
- License: MIT
- README: marketplace description, install (`pnpm add strapi-plugin-media-twins` or local path), `config/plugins.ts`, permissions, usage, threshold, v1 video note

Install in a host app:

```ts
// config/plugins.ts
export default {
  'media-twins': {
    enabled: true,
    // resolve: '../strapi-plugin-media-twins', // local path
    config: { similarityThreshold: 10 },
  },
};
```

Or `pnpm add` the package; Strapi 5 discovers `strapi.kind === 'plugin'` from `node_modules` when enabled.

Published package must be **built** (`strapi-plugin build && strapi-plugin verify`).

---

## 11. v1 non-goals

- Video / audio perceptual similarity
- Auto-merge without preview
- Replacing the core Media Library
- Content-type builder UI for ignore/fingerprint tables
- Multi-locale UI (English strings only; `registerTrads` still loads `en.json`)
- GitHub marketplace listing / PAT / CI secrets
