import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  Fragment,
  ReactElement,
} from "react";

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

  // Stable identities so a plugin's `useEffect(() => register(...), [register])`
  // does not re-run and append the same element on every provider re-render
  // (which is what made a single plugin render multiple times). The dedup guard
  // makes repeated registrations of the same element idempotent.
  const register = useCallback((position: PluginPosition, element: ReactElement) => {
    const setters = { header: setHeader, body: setBody, footer: setFooter, options: setOptions };
    setters[position]((prev) => (prev.includes(element) ? prev : [...prev, element]));
  }, []);

  const unregister = useCallback((position: PluginPosition, element: ReactElement) => {
    const setters = { header: setHeader, body: setBody, footer: setFooter, options: setOptions };
    setters[position]((prev) => prev.filter((e) => e !== element));
  }, []);

  const value = useMemo(
    () => ({ header, body, footer, options, register, unregister }),
    [header, body, footer, options, register, unregister],
  );

  return <PluginsContext.Provider value={value}>{children}</PluginsContext.Provider>;
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
