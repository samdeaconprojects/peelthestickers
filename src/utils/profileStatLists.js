// Profile stat lists: named groups of saved stat cards stored on the user
// profile as `StatLists`. The main profile layout stays in `VisibleStats`;
// "Saved Stats" is a built-in list that always exists.
// A list is only shown to other people when its owner turns on `visible`.

export const PROFILE_MAIN_LIST_ID = "profile";
export const SAVED_STATS_LIST_ID = "saved";
export const SAVED_STATS_LIST_NAME = "Saved Stats";
export const MAX_STAT_LISTS = 20;
export const MAX_STAT_LIST_ITEMS = 50;
export const MAX_STAT_LIST_NAME_LENGTH = 40;

export function cleanStatListName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, MAX_STAT_LIST_NAME_LENGTH);
}

export function createStatList(name) {
  return {
    id: `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanStatListName(name) || "Untitled list",
    items: [],
    visible: false,
    createdAt: new Date().toISOString(),
  };
}

// Always returns "Saved Stats" first, followed by the user's own lists.
export function normalizeStatLists(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set([SAVED_STATS_LIST_ID, PROFILE_MAIN_LIST_ID]);
  let savedItems = [];
  let savedVisible = false;
  const custom = [];

  source.forEach((list) => {
    if (!list || typeof list !== "object") return;
    const id = String(list.id || "").trim();
    const items = (Array.isArray(list.items) ? list.items : []).filter(
      (item) => item && typeof item === "object"
    );

    if (id === SAVED_STATS_LIST_ID) {
      savedItems = items;
      savedVisible = list.visible === true;
      return;
    }
    if (!id || seen.has(id)) return;
    seen.add(id);
    custom.push({
      id,
      name: cleanStatListName(list.name) || "Untitled list",
      items,
      visible: list.visible === true,
      createdAt: list.createdAt || null,
    });
  });

  return [
    {
      id: SAVED_STATS_LIST_ID,
      name: SAVED_STATS_LIST_NAME,
      items: savedItems,
      visible: savedVisible,
      builtIn: true,
    },
    ...custom,
  ];
}

// Strip view-only flags before persisting.
export function serializeStatLists(lists) {
  return normalizeStatLists(lists).map(({ id, name, items, visible, createdAt }) => ({
    id,
    name,
    items,
    visible,
    ...(createdAt ? { createdAt } : {}),
  }));
}

export function buildProfileItemKey(item) {
  if (!item || typeof item !== "object") return "";
  const solveKey = (solve) =>
    solve?.solveRef || solve?.datetime || solve?.createdAt || solve?.time || "";

  if (item.chart === "solveCard") return `solve::${solveKey(item.solve || {})}`;
  if (item.chart === "averageCard") {
    const solves = Array.isArray(item.solves) ? item.solves : [];
    return `average::${solves.map(solveKey).join("|")}::${solves.length}`;
  }
  return [
    String(item.chart || ""),
    String(item.section || ""),
    String(item.event || ""),
    String(item.session || ""),
    String(item.scope || ""),
    String(item.viewMode || ""),
  ].join("::");
}

// Returns { items, status } where status is "added" | "exists" | "full".
export function addItemToList(items, item) {
  const current = Array.isArray(items) ? items : [];
  const key = buildProfileItemKey(item);
  if (current.some((entry) => buildProfileItemKey(entry) === key)) {
    return { items: current, status: "exists" };
  }
  if (current.length >= MAX_STAT_LIST_ITEMS) return { items: current, status: "full" };
  return { items: [...current, item], status: "added" };
}
