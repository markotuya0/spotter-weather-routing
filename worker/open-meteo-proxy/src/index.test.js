import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "./index.js";

const SECRET = "test-secret-value";
const env = { PROXY_SECRET: SECRET };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const QUERY =
  "latitude=39.7,40.1&longitude=-105,-104.9&hourly=wind_speed_10m,rain,showers,snowfall" +
  "&wind_speed_unit=mph&precipitation_unit=inch&timeformat=unixtime&timezone=UTC" +
  "&start_date=2026-10-24&end_date=2026-10-27";

function call(path, { method = "GET", secret = SECRET, e = env } = {}) {
  const headers = secret === null ? {} : { "x-proxy-secret": secret };
  return worker.fetch(new Request(`https://proxy.example${path}`, { method, headers }), e);
}

test("forwards an allowed request to the Open-Meteo forecast URL, unchanged", async () => {
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), init };
    return new Response('[{"hourly":{}}]', { status: 200, headers: { "content-type": "application/json" } });
  };
  const res = await call(`/v1/forecast?${QUERY}`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '[{"hourly":{}}]');
  const upstream = new URL(seen.url);
  assert.equal(upstream.origin + upstream.pathname, "https://api.open-meteo.com/v1/forecast");
  assert.equal(upstream.searchParams.get("latitude"), "39.7,40.1");
  assert.equal(upstream.searchParams.get("end_date"), "2026-10-27");
  assert.deepEqual(Object.keys(seen.init.headers), ["accept"]); // secret/cookies never forwarded
});

test("passes upstream 429 status, reason and Retry-After through", async () => {
  globalThis.fetch = async () =>
    new Response('{"error":true,"reason":"Daily API request limit exceeded. Please try again tomorrow."}', {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "60" },
    });
  const res = await call(`/v1/forecast?${QUERY}`);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "60");
  assert.match(await res.text(), /Daily API request limit exceeded/);
});

test("rejects a missing or wrong secret before contacting upstream", async () => {
  let called = false;
  globalThis.fetch = async () => ((called = true), new Response("{}"));
  assert.equal((await call(`/v1/forecast?${QUERY}`, { secret: null })).status, 401);
  assert.equal((await call(`/v1/forecast?${QUERY}`, { secret: "wrong" })).status, 401);
  assert.equal(called, false);
});

test("fails closed when the secret is not configured", async () => {
  const res = await call(`/v1/forecast?${QUERY}`, { e: {}, secret: "" });
  assert.equal(res.status, 503);
});

test("only serves /v1/forecast", async () => {
  globalThis.fetch = async () => new Response("{}");
  assert.equal((await call(`/v1/archive?${QUERY}`)).status, 404);
  assert.equal((await call(`/`)).status, 404);
  assert.equal((await call(`/v1/forecast/../evil`)).status, 404);
});

test("only allows GET", async () => {
  globalThis.fetch = async () => new Response("{}");
  assert.equal((await call(`/v1/forecast?${QUERY}`, { method: "POST" })).status, 405);
});

test("rejects parameters outside the allowlist (e.g. apikey injection)", async () => {
  let called = false;
  globalThis.fetch = async () => ((called = true), new Response("{}"));
  const res = await call(`/v1/forecast?${QUERY}&apikey=abc`);
  assert.equal(res.status, 400);
  assert.equal(called, false);
});

test("rejects oversized queries", async () => {
  globalThis.fetch = async () => new Response("{}");
  const res = await call(`/v1/forecast?latitude=${"1,".repeat(9000)}1`);
  assert.equal(res.status, 414);
});
