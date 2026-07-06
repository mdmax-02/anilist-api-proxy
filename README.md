# anilist-proxy

A tiny, dependency-free passthrough for AniList's GraphQL API — deploy it on
Railway (off Cloudflare) so StreamVault's Cloudflare-hosted SvelteKit app can
reach AniList without hitting Cloudflare's own Cloudflare-to-Cloudflare bot
blocking.

## Why

AniList (`graphql.anilist.co`) is itself behind Cloudflare. When a Cloudflare
Pages/Workers app calls it directly, that request is Cloudflare-to-Cloudflare
traffic — AniList's Cloudflare frequently flags/blocks/challenges it as bot
traffic. This proxy runs somewhere else entirely (Railway), so the request
path becomes:

```
Cloudflare Pages (StreamVault) → Railway (this proxy) → AniList
```

Neither hop is Cloudflare-to-Cloudflare, so it goes through cleanly.

## Deploy to Railway

1. Push this folder to its own GitHub repo (or use `railway up` directly from
   this folder with the Railway CLI — no repo needed).
2. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo**
   (or run `railway init && railway up` from inside this folder).
3. Railway auto-detects Node from `package.json` and runs `npm start`. No
   build step, no Dockerfile needed.
4. (Optional but recommended) In Railway's **Variables** tab, set:
   ```
   PROXY_SECRET=some-long-random-string-you-make-up
   ```
   This stops random people from finding your public Railway URL and using it
   as a free open AniList relay. Leave unset if you don't care.
5. Once deployed, Railway gives you a public URL like
   `https://anilist-proxy-production.up.railway.app`. Your GraphQL endpoint is
   that URL + `/graphql`.

## Wire it into StreamVault

In the StreamVault SvelteKit project (Cloudflare Pages), add these
environment variables (Cloudflare Pages dashboard → Settings → Environment
variables, or your local `.env` for dev):

```
ANILIST_PROXY_URL=https://anilist-proxy-production.up.railway.app/graphql
ANILIST_PROXY_SECRET=some-long-random-string-you-make-up   # only if you set PROXY_SECRET above
```

`src/lib/server/anilist.ts` already reads these and falls back to calling
AniList directly if `ANILIST_PROXY_URL` isn't set (fine for local dev, where
you're not calling from a Cloudflare IP anyway).

## Test it

```bash
curl -X POST https://anilist-proxy-production.up.railway.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query{ Media(id: 1) { id title { romaji } } }"}'
```

You should get back the AniList response for media id 1 (Cowboy Bebop).
