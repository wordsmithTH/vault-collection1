
// This function is intentionally disabled. It previously ran on a fixed
// 15-minute schedule (`export const config = { schedule: ... }`), which on
// Netlify's credit-based billing burns credits continuously regardless of
// site traffic. That behavior has been replaced by an on-demand refresh
// inside comics.mjs, which only does work when a real visitor loads the
// page. This file is left in place (rather than deleted) purely because
// deleting files through some web-based editors can be finicky — having no
// `schedule` export means Netlify will not run this on any interval.

export default async () => {
  return new Response('Disabled — see comics.mjs for the on-demand refresh logic.');
};
