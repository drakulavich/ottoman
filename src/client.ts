// Pure SOFA API client: fetch only, no fs, no env reads.
// Session persistence is delegated to a SessionStore so the CLI can plug in
// the disk-backed store (src/session.ts) while the library default stays pure.

export interface SofaConfig {
  apiKey: string;
  baseUrl: string;
  clientName: string;
  modelName: string;
}

export interface Session {
  session_id: string;
  expires_at: string;
}

export interface SessionStore {
  load(): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(): Promise<void>;
}

export class MemorySessionStore implements SessionStore {
  private session: Session | null = null;
  async load() {
    return this.session;
  }
  async save(session: Session) {
    this.session = session;
  }
  async clear() {
    this.session = null;
  }
}

export class SofaApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SofaApiError";
  }
}

export interface TagList {
  items: unknown[];
}

export type ContentType = "question" | "til" | "blueprint";

export interface PostSummary {
  id: string;
  title: string;
  content_type: ContentType;
  agent_id: string;
  agent_name: string;
  agent_is_top_contributor: boolean;
  tags: string[];
  vote_count: number;
  reply_count: number;
  view_count: number;
  body_excerpt: string;
  trust_summary: unknown;
  created_at: string;
  updated_at: string;
}

export interface PostList {
  items: PostSummary[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export interface Reply {
  id: string;
  parent_id: string;
  body: string;
  agent_id: string;
  agent_name: string;
  agent_is_top_contributor: boolean;
  vote_count: number;
  trust_summary: unknown;
  created_at: string;
  updated_at: string;
}

export interface PostDetail extends Omit<PostSummary, "body_excerpt"> {
  body: string;
  replies: Reply[];
}

export interface AgentStats {
  question_count: number;
  answer_count: number;
  blueprint_count: number;
  til_count: number;
  vote_count: number;
  verification_count: number;
  reputation: number;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  persona: string;
  avatar_type: string;
  agent_is_top_contributor: boolean;
  created_at: string;
  stats: AgentStats;
}

export interface AgentList {
  items: Agent[];
}

export interface SearchOptions {
  tag?: string;
  type?: ContentType;
  page?: number;
  perPage?: number;
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; detail?: string };
    return data.error ?? data.detail ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export class SofaClient {
  constructor(
    private readonly config: SofaConfig,
    private readonly store: SessionStore = new MemorySessionStore(),
  ) {}

  private async createSession(): Promise<Session> {
    const res = await fetch(`${this.config.baseUrl}/api/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "X-Sofa-Client-Name": this.config.clientName,
        "X-Sofa-Model-Name": this.config.modelName,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) throw new SofaApiError(res.status, await errorDetail(res));
    const session = (await res.json()) as Session;
    await this.store.save(session);
    return session;
  }

  protected async request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    // Not concurrency-safe by design: two concurrent calls on a fresh client may both create sessions (harmless for one-shot CLI use; no in-flight dedup).
    const session = (await this.store.load()) ?? (await this.createSession());
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "X-Sofa-Session": session.session_id,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried) {
      await this.store.clear();
      return this.request<T>(method, path, body, true);
    }
    if (!res.ok) throw new SofaApiError(res.status, await errorDetail(res));
    return (await res.json()) as T;
  }

  async tags(): Promise<TagList> {
    return this.request<TagList>("GET", "/api/tags");
  }

  async search(query: string, opts: SearchOptions = {}): Promise<PostList> {
    const params = new URLSearchParams({ search: query });
    if (opts.tag) params.set("tag", opts.tag);
    if (opts.type) params.set("content_type", opts.type);
    if (opts.page) params.set("page", String(opts.page));
    if (opts.perPage) params.set("per_page", String(opts.perPage));
    return this.request<PostList>("GET", `/api/posts?${params}`);
  }

  async getPost(postId: string): Promise<PostDetail> {
    return this.request<PostDetail>("GET", `/api/posts/${postId}`);
  }

  async myAgents(): Promise<AgentList> {
    return this.request<AgentList>("GET", "/api/me/agents");
  }
}
