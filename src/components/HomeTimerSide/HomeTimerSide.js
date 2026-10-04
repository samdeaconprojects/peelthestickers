import React, { useLayoutEffect, useRef } from "react";

const SIDE_MARGIN_PX = 16;
// Natural width of the horizontal averages table (its max-width in AveragesDisplay.css).
const AVERAGES_FULL_WIDTH_PX = 780;

// Absolutely positioned column left of the home timer (inside .home-timer-row).
// In "timelist" mode it spans from below the scramble to the bottom of the home screen
// (--home-side-top / --home-side-bottom). So the centered averages below can't reach under
// it, it also sets --home-side-avg-max-width and a matching --home-side-avg-scale on the
// home screen.
export default function HomeTimerSide({ mode, children }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const side = ref.current;
    const row = side?.parentElement;
    const screen = row?.parentElement;
    if (mode !== "timelist" || !side || !row || !screen) return undefined;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rowRect = row.getBoundingClientRect();
        const screenRect = screen.getBoundingClientRect();
        const sideRect = side.getBoundingClientRect();
        const aboveBottoms = [".scramble-select-container .scramble-text", ".left-slot-auth"]
          .map((selector) => screen.querySelector(selector)?.getBoundingClientRect().bottom)
          .filter((value) => Number.isFinite(value));

        const topLimit = aboveBottoms.length
          ? Math.max(...aboveBottoms) + SIDE_MARGIN_PX
          : rowRect.top;
        const bottomLimit = screenRect.bottom - SIDE_MARGIN_PX;

        side.style.setProperty("--home-side-top", `${Math.round(topLimit - rowRect.top)}px`);
        side.style.setProperty(
          "--home-side-bottom",
          `${Math.round(rowRect.bottom - bottomLimit)}px`
        );

        const centerX = screenRect.left + screenRect.width / 2;
        const averagesMaxWidth = Math.max(0, 2 * (centerX - sideRect.right - SIDE_MARGIN_PX));
        const baseScale =
          parseFloat(getComputedStyle(screen).getPropertyValue("--home-averages-scale")) || 1;
        screen.style.setProperty("--home-side-avg-max-width", `${Math.round(averagesMaxWidth)}px`);
        screen.style.setProperty(
          "--home-side-avg-scale",
          String(baseScale * Math.min(1, averagesMaxWidth / AVERAGES_FULL_WIDTH_PX))
        );
      });
    };

    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(screen);
    observer?.observe(side);
    window.addEventListener("resize", update);
    update();

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
      screen.style.removeProperty("--home-side-avg-max-width");
      screen.style.removeProperty("--home-side-avg-scale");
    };
  }, [mode]);

  return (
    <div ref={ref} className={`home-timer-side home-timer-side--${mode}`}>
      {children}
    </div>
  );
}
