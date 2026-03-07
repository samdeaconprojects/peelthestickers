import { useCallback, useState } from "react";

export default function useSolveSelection() {
  const [selectedIndices, setSelectedIndices] = useState(() => new Set());
  const [anchorIndex, setAnchorIndex] = useState(null);

  const selectionCount = selectedIndices.size;

  const clearSelection = useCallback(() => {
    setSelectedIndices(new Set());
    setAnchorIndex(null);
  }, []);

  const toggleIndex = useCallback((idx) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
    setAnchorIndex(idx);
  }, []);

  const rangeSelect = useCallback(
    (idx) => {
      const a = anchorIndex == null ? idx : anchorIndex;
      const lo = Math.min(a, idx);
      const hi = Math.max(a, idx);

      setSelectedIndices((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(i);
        return next;
      });
    },
    [anchorIndex]
  );

  const handleSelectionClick = useCallback(
    (e, idx) => {
      const isShift = !!e.shiftKey;
      const isToggle = !!(e.ctrlKey || e.metaKey);
      const hasSelection = selectedIndices.size > 0;

      if (isShift) {
        e.preventDefault();
        if (anchorIndex == null) setAnchorIndex(idx);
        rangeSelect(idx);
        return true;
      }

      if (isToggle) {
        e.preventDefault();
        toggleIndex(idx);
        return true;
      }

      if (hasSelection) {
        e.preventDefault();
        toggleIndex(idx);
        return true;
      }

      return false;
    },
    [selectedIndices, anchorIndex, rangeSelect, toggleIndex]
  );

  const isIndexSelected = useCallback((idx) => selectedIndices.has(idx), [selectedIndices]);

  return {
    selectedIndices,
    selectionCount,
    anchorIndex,
    clearSelection,
    toggleIndex,
    rangeSelect,
    handleSelectionClick,
    isIndexSelected,
  };
}