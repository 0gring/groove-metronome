// Sheet-music → MusicXML via the "Sheet music to MusicXML" GitHub Action (Audiveris).
// The app uploads the PDF to omr/inbox/<job>.pdf in the user's repo with their token,
// then polls omr/out/<job>.json and downloads omr/out/<job>.mxl when it's ready.

const CFG_KEY = 'groove-metronome:omr';
const API = 'https://api.github.com';

export function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY)) ?? {};
  } catch {
    return {};
  }
}

export function saveConfig(cfg) {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

/** Suggest the app's own repo ("owner/repo") when served from GitHub Pages (owner.github.io/repo/). */
export function guessRepo(loc = location) {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(loc.hostname);
  const repo = loc.pathname.split('/').filter(Boolean)[0];
  return m && repo ? `${m[1]}/${repo}` : '';
}

export const isConfigured = (cfg = loadConfig()) => !!(cfg.repo && cfg.token);

class GhError extends Error {}

async function gh(cfg, path, opts = {}) {
  const res = await fetch(`${API}/repos/${cfg.repo}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      Accept: opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 404 && opts.allow404) return null;
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).message ?? '';
    } catch {
      /* ignore */
    }
    if (res.status === 401) throw new GhError('GitHub rejected the token (expired or mistyped?).');
    if (res.status === 403 || res.status === 404) {
      throw new GhError(`No access to ${cfg.repo}. Check the repository name and that the token has “Contents: Read and write” for it.${detail ? ` (${detail})` : ''}`);
    }
    throw new GhError(`GitHub error ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return opts.raw ? res.arrayBuffer() : res.json();
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Uploads to a public repository need the user's one-time OK (cfg.allowPublic), given in setup. */
async function assertUploadAllowed(cfg) {
  const info = await gh(cfg, '');
  if (!info.private && !cfg.allowPublic) {
    throw new GhError(`${cfg.repo} is public. Open the setup panel and tap “Save & test” to confirm that uploads may be public.`);
  }
}

/** Check repo access and that the workflow exists. Returns { message, isPublic }. */
export async function testConnection(cfg) {
  const info = await gh(cfg, '');
  const isPublic = !info.private;
  const wf = await gh(cfg, 'contents/.github/workflows/omr.yml', { allow404: true });
  if (!wf) {
    return { isPublic, message: `Connected to ${cfg.repo}, but it has no .github/workflows/omr.yml — copy the conversion workflow (.github/ and omr/ from the groove-metronome repository) into it.` };
  }
  const vis = isPublic ? 'public: converted sheet music is visible to anyone' : 'private';
  return { isPublic, message: `Connected to ${cfg.repo} (${vis}). Ready to convert.` };
}

/** Upload a PDF; returns the job id. */
export async function submit(cfg, jobId, pdfBuffer, displayName) {
  await assertUploadAllowed(cfg);
  await gh(cfg, `contents/omr/inbox/${jobId}.pdf`, {
    method: 'PUT',
    body: JSON.stringify({ message: `Convert “${displayName}” to MusicXML`, content: toBase64(pdfBuffer) }),
  });
  return jobId;
}

/**
 * Poll a job. Returns { state: 'running' } | { state: 'done', mxl: ArrayBuffer, info } | { state: 'failed', info }.
 */
export async function poll(cfg, jobId) {
  const status = await gh(cfg, `contents/omr/out/${jobId}.json`, { raw: true, allow404: true });
  if (!status) return { state: 'running' };
  const info = JSON.parse(new TextDecoder().decode(status));
  if (info.status !== 'done') return { state: 'failed', info };
  const mxl = await gh(cfg, `contents/omr/out/${jobId}.mxl`, { raw: true });
  return { state: 'done', mxl, info };
}
