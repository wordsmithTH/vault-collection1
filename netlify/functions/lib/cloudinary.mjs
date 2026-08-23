// Paginates through the Cloudinary Admin API and returns every image resource.
// Requires CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
// to be set as Netlify environment variables (Site settings > Environment variables).
// These never live in the repo or ship to the browser — this file only runs
// server-side, inside a Netlify Function.

export async function fetchAllCloudinaryResources() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud || !key || !secret) {
    throw new Error(
      'Missing CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET ' +
      'environment variables. Set these in Netlify: Site settings > Environment variables.'
    );
  }

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const all = [];
  let cursor = null;

  do {
    const url = new URL(`https://api.cloudinary.com/v1_1/${cloud}/resources/image`);
    url.searchParams.set('type', 'upload');
    url.searchParams.set('max_results', '500');
    if (cursor) url.searchParams.set('next_cursor', cursor);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Cloudinary API error ${res.status}: ${body}`);
    }

    const json = await res.json();
    all.push(...(json.resources || []));
    cursor = json.next_cursor || null;
  } while (cursor);

  return all;
}
