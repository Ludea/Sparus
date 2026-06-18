import { ReactNode, createContext } from "react";
import { LazyStore } from "@tauri-apps/plugin-store";

export interface SparusError {
  globalError:
    | {
        kind: string;
        message: string;
      }
    | undefined;
  setGlobalError: (err: unknown) => void;
}

const SparusErrorContext = createContext<SparusError>({
  globalError: undefined,
  setGlobalError: () => undefined,
});

const store = new LazyStore("Sparus.json");

const SparusStoreContext = createContext(store);

function StoreProvider({ children }: { children: ReactNode }) {
  return <SparusStoreContext.Provider value={store}>{children}</SparusStoreContext.Provider>;
}

export { SparusErrorContext, SparusStoreContext, StoreProvider };
