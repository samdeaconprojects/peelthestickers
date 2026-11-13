import { useEffect, useState } from "react";

// Phone-sized layout (and desktop windows squeezed down to phone width). Everything
// mobile-specific keys off this one query so CSS and JS switch together.
export const MOBILE_LAYOUT_QUERY = "(max-width: 640px)";

// The player bar has no room on phones in either orientation: portrait is covered by the
// mobile layout, landscape phones are short touch screens.
export const HIDE_PLAYER_BAR_QUERY = `${MOBILE_LAYOUT_QUERY}, (pointer: coarse) and (max-height: 500px)`;

function getMatch(query) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => getMatch(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function useIsMobileLayout() {
  return useMediaQuery(MOBILE_LAYOUT_QUERY);
}
