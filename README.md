[README.md](https://github.com/user-attachments/files/31348265/README.md)
# Vault Collection

A live gallery of the comic collection, synced automatically from Cloudinary — no manual data updates needed as books are added or removed.

## How it works
- `netlify/functions/refresh-comics.mjs` — a **scheduled function** that runs every 15 minutes, pulls the full asset list from Cloudinary's Admin API, and caches it in Netlify Blobs.
- `netlify/functions/comics.mjs` — an **on-demand function** at `/api/comics` that the site calls on load. It reads the cached data (fast). If nothing's cached yet (e.g. right after first deploy, before the schedule has fired once), it fetches live from Cloudinary itself and populates the cache, so the site works immediately.
- `netlify/functions/lib/` — shared code: `cloudinary.mjs` (paginated Admin API fetch) and `parse-comic.mjs` (title/grade/signature parsing, same logic in every language this project uses).
- `data.json` — a static snapshot, used only as a fallback if `/api/comics` is ever unreachable.
- `index.html` / `style.css` / `script.js` — the site itself.

No API key or secret ever ships to the browser. They live only as server-side environment variables that the functions read.

## One-time setup

**1. Set environment variables in Netlify**
Site settings → Environment variables → add:
- `CLOUDINARY_CLOUD_NAME` = `kobhvma5`
- `CLOUDINARY_API_KEY` = *(your new key)*
- `CLOUDINARY_API_SECRET` = *(your new secret)*

Use the **Media Library User** scoped key you created — not Master Admin.

**2. Push these files to the repo root**
Including `netlify/`, `package.json`, and `netlify.toml`. Netlify installs `@netlify/blobs` automatically on deploy — no local `npm install` required, though you can run it locally if you want to test with `netlify dev`.

**3. Confirm Scheduled Functions are enabled**
They're on by default for all Netlify accounts, so this is just a sanity check — look under Project configuration → Functions after your first deploy to confirm `refresh-comics` shows up with its schedule.

That's it. From here, adding or removing books in Cloudinary shows up on the live site within 15 minutes automatically, with no code changes or redeploys.

## Adjusting the refresh interval
Edit the cron expression in `netlify/functions/refresh-comics.mjs`:
```js
export const config = { schedule: '*/15 * * * *' }; // every 15 minutes
```
752 comics is 2 paginated Admin API requests per run, so even a 5-minute interval is very light — adjust freely.

## Local preview
`netlify dev` (from the [Netlify CLI](https://docs.netlify.com/cli/get-started/)) runs the functions locally against the same environment variables. Without it, opening `index.html` directly will fall back to the static `data.json` snapshot, since there's no server to answer `/api/comics`.

## Data notes
- Of the 752 comics in the original export, 140 have parsable titles/grades from their filenames (e.g. `X-Men_129_CGC_9.6_SS`). The rest are raw scanner/phone filenames with no embedded title info — they still appear in the vault grid under their assigned vault number, just without a title or grade badge.
- Vault numbers are assigned by upload order (oldest first). Adding new books appends new numbers at the end; deleting a book will shift the numbers of everything uploaded after it. It's a display label, not a permanent ID.
