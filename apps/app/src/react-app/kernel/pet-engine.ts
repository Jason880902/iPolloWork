import { workspaceBootstrap } from "@/app/lib/desktop";
import { readiPolloWorkServerSettings } from "@/app/lib/ipollowork-server";

export type PetEngineHandle = {
  mount: string;
  headers: Record<string, string>;
};

export async function resolvePetEngineHandle(): Promise<PetEngineHandle | null> {
  const settings = readiPolloWorkServerSettings();
  const baseUrl = (settings.urlOverride ?? "").replace(/\/+$/, "");
  const token = settings.token ?? "";
  if (!baseUrl || !token) return null;
  const bootstrap = await workspaceBootstrap();
  const workspaceId = bootstrap?.selectedId ?? bootstrap?.activeId ?? null;
  if (typeof workspaceId !== "string" || !workspaceId) return null;
  return {
    mount: `${baseUrl}/workspace/${encodeURIComponent(workspaceId)}/opencode/api`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  };
}

export async function petEngineRequestJson<T>(url: string, handle: PetEngineHandle, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...handle.headers, ...(init?.headers ?? {}) },
    });
    if (!response.ok) return null;
    const json = (await response.json()) as unknown;
    if (json && typeof json === "object" && "data" in json) {
      return (json as { data: T }).data;
    }
    return json as T;
  } catch {
    return null;
  }
}

type ProviderCatalogEntry = {
  id?: string;
  name?: string;
  models?: Record<string, unknown>;
};

/** Connected providers reported by the workspace engine (empty when none). */
export async function fetchPetEngineProviders(): Promise<ProviderCatalogEntry[]> {
  const handle = await resolvePetEngineHandle();
  if (!handle) return [];
  const result = await petEngineRequestJson<ProviderCatalogEntry[] | { providers?: ProviderCatalogEntry[] }>(
    `${handle.mount}/provider`,
    handle,
  );
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.providers)) return result.providers;
  return [];
}
