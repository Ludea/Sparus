import React, { createContext, useContext, useState, Fragment, ReactElement } from "react";

export type PluginPosition = "header" | "body" | "footer" | "options";

interface PluginContextType {
  header: ReactElement[];
  body: ReactElement[];
  footer: ReactElement[];
  options: ReactElement[];
  register: (position: PluginPosition, element: ReactElement) => void;
  unregister: (position: PluginPosition, element: ReactElement) => void;
}
const PluginsContext = createContext<PluginContextType | null>(null);

export const PluginsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [header, setHeader] = useState<ReactElement[]>([]);
  const [body, setBody] = useState<ReactElement[]>([]);
  const [footer, setFooter] = useState<ReactElement[]>([]);
  const [options, setOptions] = useState<ReactElement[]>([]);

  const register = (position: PluginPosition, element: ReactElement) => {
    if (position === "header") setHeader((prev) => [...prev, element]);
    if (position === "body") setBody((prev) => [...prev, element]);
    if (position === "footer") setFooter((prev) => [...prev, element]);
    if (position === "options") setOptions((prev) => [...prev, element]);
  };

  const unregister = (position: PluginPosition, element: ReactElement) => {
    if (position === "header") setHeader((prev) => prev.filter((e) => e !== element));
    if (position === "body") setBody((prev) => prev.filter((e) => e !== element));
    if (position === "footer") setFooter((prev) => prev.filter((e) => e !== element));
    if (position === "options") setOptions((prev) => prev.filter((e) => e !== element));
  };

  return (
    <PluginsContext.Provider value={{ header, body, footer, options, register, unregister }}>
      {children}
    </PluginsContext.Provider>
  );
};

export const usePluginsContext = (): PluginContextType => {
  const ctx = useContext(PluginsContext);
  if (!ctx) {
    throw new Error("usePluginsContext must be used inside a PluginsProvider");
  }
  return ctx;
};

// Renders every plugin element registered for a given position. Renders nothing
// when no plugin targets the slot, so it is a safe drop-in anywhere in the UI.
export const PluginSlot = ({ position }: { position: PluginPosition }): ReactElement => {
  const elements = usePluginsContext()[position];
  return (
    <>
      {elements.map((element, index) => (
        <Fragment key={index}>{element}</Fragment>
      ))}
    </>
  );
};
