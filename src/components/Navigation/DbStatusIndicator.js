import React from "react";
import "./DbStatusIndicator.css";

export default function DbStatusIndicator({ status }) {
  const phase = status?.phase || "idle";
  const tick = status?.tick || 0;

  // Use `tick` to retrigger CSS animations even for repeated success
  if (phase === "idle") return <span className="db-indicator-spacer" />;

  return (
    <span className="db-indicator-wrap" key={`${phase}-${tick}`} title={status?.op || ""}>
      {phase === "loading" && <span className="db-spinner" />}
      {phase === "success" && <span className="db-check" />}
      {phase === "error" && <span className="db-x" />}
    </span>
  );
}