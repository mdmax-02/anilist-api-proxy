/**
 * anilist-proxy — a tiny passthrough for AniList's GraphQL API.
 *
 * Why this exists: AniList (graphql.anilist.co) sits behind Cloudflare. When a
 * Cloudflare Pages/Workers-hosted app (like StreamVault's SvelteKit SSR) calls
 * AniList directly, that's Cloudflare-to-Cloudflare traffic, and AniList's own
 * Cloudflare frequently blocks or challenges it as bot traffic. Running this
 * proxy somewhere OFF Cloudflare (Railway, Render, Fly.io, a VPS…) gives the
 * SvelteKit app a plain, un-blocked path to AniList: it calls this proxy
 * instead, and this proxy calls AniList on its behalf.
 *
 * Deploy this as its OWN Railway project (separate from the SvelteKit app —
 * this folder is a standalone Node service). Then set the SvelteKit app's
 * ANILIST_PROXY_URL environment variable to:
 *   https://<your-railway-app>.up.railway.app/graphql
 *
 * No external dependencies — just Node's built-in http + global fetch (Node 18+).
 */

import { createServer } from 'node:http';

const PORT = process.env.PORT || 3000;
const ANILIST_URL = 'https://graphql.anilist.co';

// Optional shared-secret check. Since this proxy is publicly reachable once
// deployed, set PROXY_SECRET on Railway and send the same value as the
// `x-proxy-secret` header from the SvelteKit app to stop randoms from using
// your Railway instance as a free open AniList relay. Leave PROXY_SECRET
// unset to skip this check entirely (fine for quick testing).
const PROXY_SECRET = process.env.PROXY_SECRET || null;

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, x-proxy-secret'
};

function readBody(req) {
	return new Promise((resolve, reject) => {
		let data = '';
		req.on('data', (chunk) => {
			data += chunk;
			// 1MB sanity cap — AniList queries/variables are never this large.
			if (data.length > 1_000_000) {
				reject(new Error('Request body too large'));
				req.destroy();
			}
		});
		req.on('end', () => resolve(data));
		req.on('error', reject);
	});
}

const server = createServer(async (req, res) => {
	// CORS preflight
	if (req.method === 'OPTIONS') {
		res.writeHead(204, CORS_HEADERS);
		res.end();
		return;
	}

	if (req.url === '/health' || req.url === '/') {
		res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
		res.end(JSON.stringify({ ok: true, service: 'anilist-proxy' }));
		return;
	}

	if (req.url !== '/graphql' || req.method !== 'POST') {
		res.writeHead(404, { 'Content-Type': 'application/json', ...CORS_HEADERS });
		res.end(JSON.stringify({ ok: false, error: 'Not found. POST your GraphQL query to /graphql.' }));
		return;
	}

	if (PROXY_SECRET && req.headers['x-proxy-secret'] !== PROXY_SECRET) {
		res.writeHead(401, { 'Content-Type': 'application/json', ...CORS_HEADERS });
		res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
		return;
	}

	try {
		const body = await readBody(req);

		const upstream = await fetch(ANILIST_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body
		});

		const text = await upstream.text();

		res.writeHead(upstream.status, {
			'Content-Type': upstream.headers.get('content-type') || 'application/json',
			...CORS_HEADERS
		});
		res.end(text);
	} catch (err) {
		console.error('[anilist-proxy] upstream request failed:', err);
		res.writeHead(502, { 'Content-Type': 'application/json', ...CORS_HEADERS });
		res.end(JSON.stringify({ ok: false, error: 'Upstream AniList request failed' }));
	}
});

server.listen(PORT, () => {
	console.log(`[anilist-proxy] listening on port ${PORT}`);
});
