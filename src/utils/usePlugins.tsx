import {
  FC,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  Fragment,
  ReactElement,
} from "react";

export type PluginPosition = "header" | "body" | "footer" | "options";

// CSS lengths: a number is treated as px, a string is used as-is (e.g. "10%").
export type PluginCoords = {
  x: number | string;
  y: number | string;
};

export type RegisterPluginFn = (
  position: PluginPosition,
  element: ReactElement,
  coords?: PluginCoords,
) => void;

type PluginEntry = {
  element: ReactElement;
  coords?: PluginCoords;
};

interface PluginContextType {
  header: PluginEntry[];
  body: PluginEntry[];
  footer: PluginEntry[];
  options: PluginEntry[];
  register: RegisterPluginFn;
  unregister: (position: PluginPosition, element: ReactElement) => void;
}
const PluginsContext = createContext<PluginContextType | null>(null);

const addPluginEntry = (entries: PluginEntry[], entry: PluginEntry) => {
  const alreadyRegistered = entries.some(
    (registered) =>
      registered.element.key === entry.element.key &&
      registered.element.type === entry.element.type,
  );

  if (alreadyRegistered) return entries;

  return [...entries, entry];
};

export const PluginsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [header, setHeader] = useState<PluginEntry[]>([]);
  const [body, setBody] = useState<PluginEntry[]>([]);
  const [footer, setFooter] = useState<PluginEntry[]>([]);
  const [options, setOptions] = useState<PluginEntry[]>([]);

  const register = useCallback(
    (position: PluginPosition, element: ReactElement, coords?: PluginCoords) => {
      const entry = { element, coords };
      if (position === "header") setHeader((prev) => addPluginEntry(prev, entry));
      if (position === "body") setBody((prev) => addPluginEntry(prev, entry));
      if (position === "footer") setFooter((prev) => addPluginEntry(prev, entry));
      if (position === "options") setOptions((prev) => addPluginEntry(prev, entry));
    },
    [],
  );

  const unregister = useCallback((position: PluginPosition, element: ReactElement) => {
    if (position === "header") setHeader((prev) => prev.filter((e) => e.element !== element));
    if (position === "body") setBody((prev) => prev.filter((e) => e.element !== element));
    if (position === "footer") setFooter((prev) => prev.filter((e) => e.element !== element));
    if (position === "options") setOptions((prev) => prev.filter((e) => e.element !== element));
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

export const PluginSlot = ({ position }: { position: PluginPosition }): ReactElement => {
  const entries = usePluginsContext()[position];
  return (
    <>
      {entries.map((entry, index) =>
        entry.coords ? (
          // Anchored to the slot area: the slot's container is the nearest
          // positioned ancestor (relative/fixed), so x/y are offsets inside it.
          <div
            key={index}
            style={{ position: "absolute", left: entry.coords.x, top: entry.coords.y }}
          >
            {entry.element}
          </div>
        ) : (
          <Fragment key={index}>{entry.element}</Fragment>
        ),
      )}
    </>
  );
};
