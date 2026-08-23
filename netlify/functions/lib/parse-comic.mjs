// Mirrors parse.py — turns raw Cloudinary public_ids into vault entries with
// a stable sequential vault number, plus best-effort title/grade/signature
// parsing for filenames that follow the "Series_Issue_CGC_Grade_..." pattern.

const TIMESTAMP_RE = /^\d{9,}_[a-z0-9]{5,8}$/;
const DATE_RE = /^\d{8}_\d{6}_[a-z0-9]{5,8}$/;
const SUFFIX_RE = /^[a-z0-9]{5,8}$/;
const GRADE_RE = /CGC[_.]?(\d(?:\.\d)?)/i;
const SS_RE = /\bSS[xX]?(\d)?\b/;
const DROP_WORDS = new Set(['cgc', 'ss', 'front', 'cover', 'back', 'fc', 'bc', 'var', 'v1', 'v2']);

function cleanTitle(publicId) {
  let tokens = publicId.split('_');

  // drop the trailing Cloudinary random suffix, e.g. "_gbr2z2"
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && SUFFIX_RE.test(last) && !/^\d+$/.test(last)) {
    tokens = tokens.slice(0, -1);
  }

  const out = [];
  let skipNextDigitAfterCgc = false;
  for (const t of tokens) {
    const tl = t.toLowerCase();
    if (tl === 'cgc') { skipNextDigitAfterCgc = true; continue; }
    if (skipNextDigitAfterCgc) {
      skipNextDigitAfterCgc = false;
      if (/^\d(\.\d)?$/.test(t)) continue;
    }
    if (/^ss[xX]?\d*$/.test(tl)) continue;
    if (DROP_WORDS.has(tl)) continue;
    out.push(t);
  }

  let title = out.join(' ').replace(/_/g, ' ');
  title = title.replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '');
  title = title.replace(/\.\s*\./g, '.');
  return title;
}

export function parseComics(resources) {
  const sorted = [...resources].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  return sorted.map((r, i) => {
    const pid = r.public_id;
    const no = String(i + 1).padStart(4, '0');
    const isBare = TIMESTAMP_RE.test(pid) || DATE_RE.test(pid);

    const gradeMatch = pid.match(GRADE_RE);
    const grade = gradeMatch ? gradeMatch[1] : null;

    const ssMatch = pid.match(SS_RE);
    const ss = !!ssMatch;
    const ssCount = ssMatch && ssMatch[1] ? parseInt(ssMatch[1], 10) : null;

    let title = null;
    if (!isBare) {
      const t = cleanTitle(pid);
      title = t || null;
    }

    return {
      no,
      id: pid,
      title,
      grade,
      ss,
      ssCount,
      url: r.secure_url,
      w: r.width,
      h: r.height,
      added: r.created_at,
    };
  });
}
