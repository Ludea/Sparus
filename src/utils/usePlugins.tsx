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

interface PluginContextType {
  header: ReactElement[];
  body: ReactElement[];
  footer: ReactElement[];
  options: ReactElement[];
  register: (position: PluginPosition, element: ReactElement) => void;
  unregister: (position: PluginPosition, element: ReactElement) => void;
}
const PluginsContext = createContext<PluginContextType | null>(null);

const addPluginElement = (elements: ReactElement[], element: ReactElement) => {
  const alreadyRegistered = elements.some(
    (registered) => registered.key === element.key && registered.type === element.type,
  );

  if (alreadyRegistered) return elements;

  return [...elements, element];
};

export const PluginsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [header, setHeader] = useState<ReactElement[]>([]);
  const [body, setBody] = useState<ReactElement[]>([]);
  const [footer, setFooter] = useState<ReactElement[]>([]);
  const [options, setOptions] = useState<ReactElement[]>([]);

  const register = useCallback((position: PluginPosition, element: ReactElement) => {
    if (position === "header") setHeader((prev) => addPluginElement(prev, element));
    if (position === "body") setBody((prev) => addPluginElement(prev, element));
    if (position === "footer") setFooter((prev) => addPluginElement(prev, element));
    if (position === "options") setOptions((prev) => addPluginElement(prev, element));
  }, []);

  const unregister = useCallback((position: PluginPosition, element: ReactElement) => {
    if (position === "header") setHeader((prev) => prev.filter((e) => e !== element));
    if (position === "body") setBody((prev) => prev.filter((e) => e !== element));
    if (position === "footer") setFooter((prev) => prev.filter((e) => e !== element));
    if (position === "options") setOptions((prev) => prev.filter((e) => e !== element));
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
  const elements = usePluginsContext()[position];
  return (
    <>
      {elements.map((element, index) => (
        <Fragment key={index}>{element}</Fragment>
      ))}
    </>
  );
};
