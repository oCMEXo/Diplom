import { useCallback, useEffect, useState } from "react";

const MAX_TABS = 12;
const key = (projectId: string) => `collab.tabs.${projectId}`;

export function addTab(tabs: string[], id: string): string[] {
  if (tabs.includes(id)) return tabs;
  const next = [...tabs, id];
  // Beyond the limit the oldest tab that is not the new one goes.
  return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next;
}

/** Closing a tab returns the remaining tabs and the one to show next (its right neighbour, else the left). */
export function closeTab(tabs: string[], id: string): { tabs: string[]; next: string | null } {
  const index = tabs.indexOf(id);
  if (index === -1) return { tabs, next: null };
  const remaining = tabs.filter((tab) => tab !== id);
  return { tabs: remaining, next: remaining[index] ?? remaining[index - 1] ?? null };
}

export function pruneTabs(tabs: string[], existing: Set<string>): string[] {
  const kept = tabs.filter((id) => existing.has(id));
  return kept.length === tabs.length ? tabs : kept;
}

function load(projectId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(projectId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** The files a person has open in this project, remembered per browser. */
export function useOpenTabs(projectId: string, existingIds: string[], activeId: string | undefined) {
  const [tabs, setTabs] = useState<string[]>(() => load(projectId));
  const idsKey = existingIds.join(",");

  useEffect(() => setTabs(load(projectId)), [projectId]);

  useEffect(() => {
    setTabs((current) => {
      const ids = idsKey ? idsKey.split(",") : [];
      let next = pruneTabs(current, new Set(ids));
      if (activeId && ids.includes(activeId)) next = addTab(next, activeId);
      return next === current || next.join() === current.join() ? current : next;
    });
  }, [activeId, idsKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(key(projectId), JSON.stringify(tabs));
    } catch {
      // storage may be blocked; tabs then only last for this visit
    }
  }, [projectId, tabs]);

  const close = useCallback(
    (id: string) => {
      const result = closeTab(tabs, id);
      setTabs(result.tabs);
      return result.next;
    },
    [tabs],
  );

  return { tabs, close };
}
