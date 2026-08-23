import { getStore } from '@netlify/blobs';
import { fetchAllCloudinaryResources } from './lib/cloudinary.mjs';
import { parseComics } from './lib/parse-comic.mjs';

// Serves the cached comics list from Netlify Blobs (kept fresh by
// refresh-comics.mjs on a schedule). If nothing's cached yet — e.g. right
// after the very first deploy, before the schedule has fired — it fetches
// live from Cloudinary once and populates the cache so the site works
// immediately instead of showing empty.

export default async () => {
  const store = getStore('vault');

  let data = await store.get('comics', { type: 'json' });
  let bootstrapped = false;

  if (!data) {
    try {
      const resources = await fetchAllCloudinaryResources();
      data = parseComics(resources);
      await store.setJSON('comics', data);
      bootstrapped = true;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: String(err && err.message ? err.message : err) }),
        { status: 502, headers: { 'content-type': 'application/json' } }
      );
    }
  }

  return new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=60',
      'x-vault-bootstrapped': String(bootstrapped),
    },
  });
};

export const config = { path: '/api/comics' };
