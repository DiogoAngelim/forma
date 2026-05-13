const DEFAULT_API_URL = "http://localhost:3000";

const API_URL = (import.meta.env.VITE_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, "");

export type ProjectSourceFile = {
  path: string;
  mime?: string;
  size?: number;
  r2Key?: string;
};

export type ProjectSourceFiles = {
  id?: string;
  kind?: string;
  files: ProjectSourceFile[];
  createdAt?: string;
};

export type AuthUser = {
  id?: string;
  name?: string | null;
  email: string;
  avatar?: string | null;
  provider?: string | null;
  createdAt?: string;
  billing?: Record<string, unknown>;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type ApiProject = {
  id: string;
  name: string;
  status?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type GeneratedProjectOutput = {
  id?: string;
  projectId?: string;
  uploadId?: string;
  markup?: string;
  blocks?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type ExportType = "blocks_only" | "plugin_zip" | "theme_tokens" | "react";

export type ExportResult = {
  url?: string;
  key?: string;
  filename?: string;
  contentType?: string;
  type?: ExportType;
};

export type PublicProject = {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: GeneratedProjectOutput;
  metadata?: Record<string, unknown>;
  author?: {
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
  };
  createdAt?: string;
  projectCreatedAt?: string;
};

export type ShowcaseProject = {
  slug: string;
  title: string;
  status?: string;
  metadata?: Record<string, unknown>;
  author?: PublicProject["author"];
  blockCount?: number;
  generatedFileCount?: number;
  likes?: number;
  dislikes?: number;
  previewImageUrl?: string | null;
  createdAt?: string;
  projectCreatedAt?: string;
};

export type ProjectUpdate = {
  name?: string;
  metadata?: Record<string, unknown>;
};

export type AiSuggestion = {
  id: string;
  project_id?: string;
  projectId?: string;
  title: string;
  rationale?: string;
  priority?: string;
  action?: Record<string, unknown>;
  auto_applicable?: number | boolean;
  autoApplicable?: boolean;
  status?: string;
  created_at?: string;
  createdAt?: string;
};

export type AiStatus = {
  enabled: boolean;
  provider?: string | null;
};

export function hasApiAuthToken() {
  return Boolean(
    localStorage.getItem("forma_token") ??
    localStorage.getItem("token") ??
    localStorage.getItem("auth_token")
  );
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem("forma_user");
  if (!raw || raw === "true") return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeAuthSession(session: AuthResponse) {
  localStorage.setItem("forma_token", session.token);
  localStorage.setItem("auth_token", session.token);
  localStorage.setItem("forma_user", JSON.stringify(session.user));
}

export function clearAuthSession() {
  localStorage.removeItem("forma_token");
  localStorage.removeItem("token");
  localStorage.removeItem("auth_token");
  localStorage.removeItem("forma_user");
}

function authHeaders(): HeadersInit {
  const token =
    localStorage.getItem("forma_token") ??
    localStorage.getItem("token") ??
    localStorage.getItem("auth_token");

  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;

    try {
      const body = await response.json();
      const error = body?.error;
      message = error?.message ?? body?.message ?? message;
    } catch {
      const text = await response.text();
      if (text.trim()) message = text;
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function projectPreviewUrl(projectId: string) {
  return `${API_URL}/api/projects/${projectId}/preview`;
}

export function projectSourceBaseUrl(projectId: string) {
  return `${API_URL}/api/projects/${projectId}/source-file?path=`;
}

export function googleAuthUrl() {
  return `${API_URL}/auth/google`;
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const session = await parseResponse<AuthResponse>(response);
  storeAuthSession(session);
  return session;
}

export async function register(email: string, password: string, name: string) {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  const session = await parseResponse<AuthResponse>(response);
  storeAuthSession(session);
  return session;
}

export async function startBillingCheckout(planId: "pro" | "studio") {
  const response = await fetch(`${API_URL}/api/billing/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ planId }),
  });

  return parseResponse<{ url: string; mode: "checkout" | "portal" }>(response);
}

export async function openBillingPortal() {
  const response = await fetch(`${API_URL}/api/billing/portal`, {
    method: "POST",
    headers: authHeaders(),
  });

  return parseResponse<{ url: string }>(response);
}

export async function fetchMe() {
  const response = await fetch(`${API_URL}/api/me`, {
    headers: authHeaders(),
  });

  return parseResponse<AuthUser>(response);
}

export async function deleteAccount() {
  const response = await fetch(`${API_URL}/api/me`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  return parseResponse<void>(response);
}

export async function fetchProjects() {
  const response = await fetch(`${API_URL}/api/projects`, {
    headers: authHeaders(),
  });

  return parseResponse<ApiProject[]>(response);
}

export async function createProject(name: string, metadata: Record<string, unknown> = {}) {
  const response = await fetch(`${API_URL}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ name, metadata }),
  });

  return parseResponse<ApiProject>(response);
}

export async function fetchProject(projectId: string) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
    headers: authHeaders(),
  });

  return parseResponse<ApiProject>(response);
}

export async function fetchProjectOutput(projectId: string) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/output`, {
    headers: authHeaders(),
  });

  return parseResponse<GeneratedProjectOutput>(response);
}

export async function updateProjectOutput(
  projectId: string,
  update: {
    markup: string;
    blocks: Array<Record<string, unknown>>;
    metadata?: Record<string, unknown>;
  },
) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/output`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(update),
  });

  return parseResponse<GeneratedProjectOutput>(response);
}

export async function fetchProjectSourceFiles(projectId: string) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/source-files`, {
    headers: authHeaders(),
  });

  return parseResponse<ProjectSourceFiles>(response);
}

export async function exportProject(projectId: string, type: ExportType) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ type }),
  });

  return parseResponse<ExportResult>(response);
}

export async function downloadProjectExport(projectId: string, type: ExportType) {
  const result = await exportProject(projectId, type);
  if (!result.url) return { result, blobUrl: null };

  const response = await fetch(result.url, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Download failed with ${response.status}`);
  }

  const blob = await response.blob();
  return {
    result,
    blobUrl: URL.createObjectURL(blob),
  };
}

export async function publishProject(projectId: string, title: string, slug: string) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ slug, title }),
  });

  return parseResponse<{ slug: string; url: string }>(response);
}

export async function unpublishProject(projectId: string) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/unpublish`, {
    method: "POST",
    headers: authHeaders(),
  });

  return parseResponse<{ status: string; unpublishedAt: string }>(response);
}

export async function fetchPublicProject(slug: string) {
  const response = await fetch(`${API_URL}/api/public/${slug}`);
  return parseResponse<PublicProject>(response);
}

export async function fetchShowcaseProjects() {
  const response = await fetch(`${API_URL}/api/showcase`);
  return parseResponse<ShowcaseProject[]>(response);
}

export async function reactToPublicProject(slug: string, active: boolean) {
  const response = await fetch(`${API_URL}/api/public/${slug}/reaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reaction: "like", active }),
  });

  return parseResponse<{ likes: number; dislikes: number }>(response);
}

export async function updateProject(projectId: string, update: ProjectUpdate) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(update),
  });

  return parseResponse(response);
}

export async function deleteProject(projectId: string) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  return parseResponse<void>(response);
}

export async function deleteProjects(projectIds: string[]) {
  const response = await fetch(`${API_URL}/api/projects`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ ids: projectIds }),
  });

  return parseResponse<void>(response);
}

export async function duplicateProject(projectId: string) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/duplicate`, {
    method: "POST",
    headers: authHeaders(),
  });

  return parseResponse<ApiProject>(response);
}

export async function uploadProjectBundle(projectId: string, files: File[]) {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file, file.webkitRelativePath || file.name);
  });

  const response = await fetch(`${API_URL}/api/projects/${projectId}/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  return parseResponse<GeneratedProjectOutput>(response);
}

export async function importProjectUrl(projectId: string, url: string) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/import/url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ url }),
  });

  return parseResponse<GeneratedProjectOutput>(response);
}

export async function fetchProjectSourceFile(projectId: string, path: string) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/source-file?path=${encodeURIComponent(path)}`, {
    headers: authHeaders(),
  });
  if (!response.ok) await parseResponse(response);

  return {
    blob: await response.blob(),
    contentType: response.headers.get("content-type") ?? undefined,
  };
}

export async function fetchProjectPreviewHtml(projectId: string) {
  const response = await fetch(projectPreviewUrl(projectId), {
    headers: authHeaders(),
  });
  if (!response.ok) await parseResponse(response);
  return response.text();
}

export async function fetchAiStatus() {
  const response = await fetch(`${API_URL}/api/ai/status`, {
    headers: authHeaders(),
  });

  return parseResponse<AiStatus>(response);
}

export async function fetchAiSuggestions(projectId: string) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/suggestions`, {
    headers: authHeaders(),
  });

  return parseResponse<AiSuggestion[]>(response);
}

export async function applyAiSuggestion(projectId: string, suggestionId: string) {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/suggestions/${suggestionId}/apply`, {
    method: "POST",
    headers: authHeaders(),
  });

  return parseResponse(response);
}

export async function uploadProjectSourceFiles(projectId: string, files: File[]) {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file, file.webkitRelativePath || file.name);
  });

  const response = await fetch(`${API_URL}/api/projects/${projectId}/source-files`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  return parseResponse<ProjectSourceFiles>(response);
}
