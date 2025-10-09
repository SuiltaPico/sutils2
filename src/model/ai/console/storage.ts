import { type AISettings, type ChatSession } from "./types";

const LS_KEY_SETTINGS = "ai.console.settings.v1";
const LS_KEY_SESSIONS = "ai.console.sessions.v1";

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(LS_KEY_SETTINGS);
    if (!raw) return { googleApiKey: "", defaultModel: "gemini-2.0-flash-001" };
    const data = JSON.parse(raw);
    return {
      googleApiKey: String(data.googleApiKey ?? ""),
      defaultModel: String(data.defaultModel ?? "gemini-2.0-flash-001"),
    };
  } catch {
    return { googleApiKey: "", defaultModel: "gemini-2.0-flash-001" };
  }
}

export function saveSettings(next: AISettings): void {
  const data = {
    googleApiKey: next.googleApiKey,
    defaultModel: next.defaultModel,
  } satisfies AISettings;
  localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(data));
}

export function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(LS_KEY_SESSIONS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as ChatSession[];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  localStorage.setItem(LS_KEY_SESSIONS, JSON.stringify(sessions));
}

export function upsertSession(s: ChatSession): ChatSession[] {
  const sessions = loadSessions();
  const idx = sessions.findIndex((x) => x.id === s.id);
  const copy = [...sessions];
  if (idx >= 0) copy[idx] = s;
  else copy.unshift(s);
  saveSessions(copy);
  return copy;
}

export function deleteSession(id: string): ChatSession[] {
  const next = loadSessions().filter((x) => x.id !== id);
  saveSessions(next);
  return next;
}


