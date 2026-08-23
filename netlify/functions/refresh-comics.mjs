import { getStore } from '@netlify/blobs';
import { fetchAllCloudinaryResources } from './lib/cloudinary.mjs';
import { parseComics } from './lib/parse-comic.mjs';

// Runs on a schedule (see `config.schedule` below) and refreshes the cached
// comics list so additions/removals in Cloudinary show up on the live site
// without any manual regeneration or redeploy. Adjust the cron expression
// to control how "fresh" the site is allowed to be — every 15 minutes is a
// light touch on the Admin API (752 comics = 2 paginated requests per run).

export default async () => {
  const resources = await fetchAllCloudinaryResources();
  const data = parseComics(resources);

  const store = getStore('vault');
  await store.setJSON('comics', data);

  console.log(`Vault refreshed: ${data.length} comics cached (${new Date().toISOString()}).`);
};

// Every 15 minutes. Cron format: minute hour day month weekday.
export const config = { schedule: '*/15 * * * *' };
