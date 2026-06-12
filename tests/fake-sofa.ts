// Fake SOFA server: real HTTP via Bun.serve, per-test route injection.
// Never mock fetch — tests must exercise the same network path production uses.

export type Handler = (req: Request, url: URL) => Response | Promise<Response>;

export interface RecordedRequest {
  method: string;
  path: string; // pathname + search
  headers: Record<string, string>;
  body: unknown;
}

export interface FakeSofa {
  baseUrl: string;
  requests: RecordedRequest[];
  route(method: string, pathname: string, handler: Handler): void;
  /** Convenience: standard happy-path session endpoint. */
  routeSession(sessionId?: string): void;
  stop(): void;
}

export function startFakeSofa(): FakeSofa {
  const routes = new Map<string, Handler>();
  const requests: RecordedRequest[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      let body: unknown = null;
      const text = await req.text();
      if (text) body = JSON.parse(text);
      requests.push({
        method: req.method,
        path: url.pathname + url.search,
        headers: Object.fromEntries(req.headers.entries()),
        body,
      });
      const handler = routes.get(`${req.method} ${url.pathname}`);
      if (!handler) {
        return Response.json({ error: `fake-sofa: no route for ${req.method} ${url.pathname}` }, { status: 500 });
      }
      return handler(req, url);
    },
  });
  const fake: FakeSofa = {
    baseUrl: `http://localhost:${server.port}`,
    requests,
    route(method, pathname, handler) {
      routes.set(`${method} ${pathname}`, handler);
    },
    routeSession(sessionId = "sess-1") {
      fake.route("POST", "/api/sessions", () =>
        Response.json(
          { session_id: sessionId, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() },
          { status: 201 },
        ),
      );
    },
    stop() {
      server.stop(true);
    },
  };
  return fake;
}
