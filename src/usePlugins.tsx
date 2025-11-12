import React, {
  createContext,
  useContext,
  useState,
  ReactElement,
} from "react";

export type PluginPosition = "header" | "body" | "footer";

interface PluginContextType {
  header: ReactElement[];
  body: ReactElement[];
  footer: ReactElement[];
  register: (position: PluginPosition, element: ReactElement) => void;
  unregister: (position: PluginPosition, element: ReactElement) => void;
}
const PluginsContext = createContext<PluginContextType | null>(null);

export const PluginsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [header, setHeader] = useState<ReactElement[]>([]);
  const [body, setBody] = useState<ReactElement[]>([]);
  const [footer, setFooter] = useState<ReactElement[]>([]);

  const register = (position: PluginPosition, element: ReactElement) => {
    if (position === "header") setHeader((prev) => [...prev, element]);
    if (position === "body") setBody((prev) => [...prev, element]);
    if (position === "footer") setFooter((prev) => [...prev, element]);
  };

  const unregister = (position: PluginPosition, element: ReactElement) => {
    if (position === "header")
      setHeader((prev) => prev.filter((e) => e !== element));
    if (position === "body")
      setBody((prev) => prev.filter((e) => e !== element));
    if (position === "footer")
      setFooter((prev) => prev.filter((e) => e !== element));
  };

  return (
    <PluginsContext.Provider
      value={{ header, body, footer, register, unregister }}
    >
      {children}
    </PluginsContext.Provider>
  );
};

// ✅ Hook d’accès
export const usePluginsContext = (): PluginContextType => {
  const ctx = useContext(PluginsContext);
  if (!ctx) {
    throw new Error("usePluginsContext must be used inside a PluginsProvider");
  }
  return ctx;
};
