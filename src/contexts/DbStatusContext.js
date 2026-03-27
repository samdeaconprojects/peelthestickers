import React, { createContext, useContext } from "react";

const noopAsync = async (_opLabel, fn) => {
  if (typeof fn !== "function") return undefined;
  return fn();
};

const DbStatusContext = createContext({
  dbStatus: { phase: "idle", op: "", tick: 0 },
  runDb: noopAsync,
  setDbPhase: () => {},
});

export function DbStatusProvider({ value, children }) {
  return <DbStatusContext.Provider value={value}>{children}</DbStatusContext.Provider>;
}

export function useDbStatus() {
  return useContext(DbStatusContext);
}

