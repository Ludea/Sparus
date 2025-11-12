import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactElement,
} from "react";

export type PluginPosition = "header" | "body" | "footer";

interface PluginContextType {
  register: (position: PluginPosition, element: ReactElement) => void;
  header: [];
  body: ReactElement[];
  footer: ReactElement[];
}

export const PluginsContext = createContext<PluginContextType | null>(null);

export function usePluginsContext() {
  const ctx = useContext(PluginsContext);
  if (!ctx)
    throw new Error("usePluginsContext must be used inside <PluginManager>");
  return ctx;
}

export function usePluginsState() {
  const [plugins, setPlugins] = useState<
    { position: PluginPosition; element: ReactElement }[]
  >([]);

  const register = useCallback(
    (position: PluginPosition, element: ReactElement) => {
      setPlugins((prev) => [...prev, { position, element }]);
    },
    [],
  );

  return {
    register,
    header: plugins
      .filter((p) => p.position === "header")
      .map((p) => p.element),
    body: plugins.filter((p) => p.position === "body").map((p) => p.element),
    footer: plugins
      .filter((p) => p.position === "footer")
      .map((p) => p.element),
  };
}
