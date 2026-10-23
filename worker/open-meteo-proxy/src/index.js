// Minimal Cloudflare Worker proxy for Open-Meteo's /v1/forecast.
//
// Why: Open-Meteo's free API rate-limits by IP, and its terms say apps on
// shared hosts such as Render "might be rate-limited earlier then expected"
// and suggest Cloudflare Workers, where limits are applied per Cloudflare user
// (https://open-meteo.com/en/terms). This Worker is a locked-down pass-through:
// one upstream host, one path, GET only, a fixed parameter allowlist, and a
// shared secret so it cannot be used as an open proxy.
//
// Secret: set with `wrangler secret put PROXY_SECRET` (never in source).

const UPSTREAM_URL = "https://api.open-meteo.com/v1/forecast";
const ALLOWED_PATH = "/v1/forecast";
const SECRET_HEADER = "x-proxy-secret";
const MAX_QUERY_LENGTH = 16_384;

// Exactly the parameters backend/providers/weather/open_meteo.py sends.
const ALLOWED_PARAMS = new Set([
  "latitude",
  "longitude",
  "hourly",
  "wind_speed_unit",
  "precipitation_unit",
  "timeformat",
  "timezone",
  "start_date",
  "end_date",
]);

const encoder = new TextEncoder();

async function secretsMatch(provided, expected) {
  // Compare SHA-256 digests with a constant-time loop so neither length nor
  // content of the secret leaks through timing.
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function json(status, message) {
  return new Response(JSON.stringify({ error: true, reason: message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    if (!env.PROXY_SECRET) return json(503, "Proxy is not configured.");

    const url = new URL(request.url);
    if (url.pathname !== ALLOWED_PATH) return json(404, "Not found.");
    if (request.method !== "GET") return json(405, "Method not allowed.");

    const provided = request.headers.get(SECRET_HEADER) ?? "";
    if (!(await secretsMatch(provided, env.PROXY_SECRET))) return json(401, "Unauthorized.");

    if (url.search.length > MAX_QUERY_LENGTH) return json(414, "Query too long.");
    const upstream = new URL(UPSTREAM_URL);
    for (const [key, value] of url.searchParams) {
      if (!ALLOWED_PARAMS.has(key)) return json(400, `Parameter not allowed: ${key}`);
      upstream.searchParams.append(key, value);
    }

    // Forward only an Accept header; never the caller's other headers/cookies.
    const response = await fetch(upstream, { method: "GET", headers: { accept: "application/json" } });

    // Pass status/body through unchanged so the backend sees Open-Meteo's own
    // 429 reasons ("Daily API request limit exceeded", ...).
    const headers = new Headers({
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    });
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) headers.set("retry-after", retryAfter);
    return new Response(response.body, { status: response.status, headers });
  },
};
