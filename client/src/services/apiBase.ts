export function apiUrl(path: string): string {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return `${fromEnv.replace(/\/$/, "")}${trimmed}`;
  return trimmed;
}
