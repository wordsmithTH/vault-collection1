import { getStore } from '@netlify/blobs';
import { fetchAllCloudinaryResources } from './lib/cloudinary.mjs';
import { parseComics } from './lib/parse-comic.mjs';

// Serves the comics list, refreshing it from Cloudinary only when a real
// visitor requests it AND the cached copy is older than TTL_MS. There is
// no background schedule — this keeps cost tied to actual traffic instead
// of a fixed interval running 24/7 regardless of whether anyone's looking.
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — bump this up if credits are tight

export default async () => {
  const store = getStore('vault');
  const cached = await store.get('comics', { type: 'json' });
  const now = Date.now();

  // Handle both the new cache shape ({data, fetchedAt}) and the old one
  // (a raw array, written by the scheduled function that used to run) so
  // this doesn't break on whatever's already sitting in the blob store.
  let data, fetchedAt;
  if (Array.isArray(cached)) {
    data = cached;
    fetchedAt = 0; // unknown age — treat as stale so it normalizes on next fetch
  } else if (cached) {
    data = cached.data;
    fetchedAt = cached.fetchedAt || 0;
  }

  const stale = !data || (now - fetchedAt) > TTL_MS;

  if (stale) {
    try {
      const resources = await fetchAllCloudinaryResources();
      data = parseComics(resources);
      await store.setJSON('comics', { data: data, fetchedAt: now });
    } catch (err) {
      if (!data) {
        return new Response(
          JSON.stringify({ error: String(err && err.message ? err.message : err) }),
          { status: 502, headers: { 'content-type': 'application/json' } }
        );
      }
      // live fetch failed but we still have a (stale) cached copy — serve
      // that rather than showing an error, and try again on the next visit.
    }
  }

  return new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300',
    },
  });
};

export const config = { path: '/api/comics' };
