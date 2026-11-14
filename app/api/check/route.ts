import { callApi, fail, fromCache, guard, respond, str, toCache } from '@/lib/apiverve';

// GET /api/check?domain=example.com&type=A: one DNS Propagation call.
// Propagation is about change, so answers are only cached for 2 minutes.
const TTL_MS = 2 * 60_000;
const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT'];
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const domain = str(params.get('domain'), 253)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  const type = str(params.get('type'), 5).toUpperCase() || 'A';
  if (!domain) return fail('Enter a domain, like example.com');
  if (!DOMAIN.test(domain)) return fail('That doesn’t look like a domain name');
  if (!TYPES.includes(type)) return fail(`Record type must be one of ${TYPES.join(', ')}`);

  const key = `dns:${type}:${domain}`;
  const hit = fromCache(key, TTL_MS);
  if (hit) return Response.json(hit);

  const blocked = guard(request);
  if (blocked) return blocked;

  return respond(async () => {
    const data = await callApi('dnspropagation', { query: { domain, type } });
    toCache(key, data);
    return data;
  });
}
