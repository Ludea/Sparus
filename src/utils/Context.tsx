import { ReactNode, createContext } from "react";
import { LazyStore } from "@tauri-apps/plugin-store";

type SparusError = {
  globalError: string;
  setGlobalError: (err: string) => void;
};

const SparusErrorContext = createContext<SparusError>({
  globalError: "",
  setGlobalError: () => {},
});

const store = new LazyStore("Sparus.json", {
  autoSave: true,
});

const SparusStoreContext = createContext(store);

function StoreProvider({ children }: { children: ReactNode }) {
  return (
    <SparusStoreContext.Provider value={store}>
      {children}
    </SparusStoreContext.Provider>
  );
}

export { SparusErrorContext, SparusStoreContext, StoreProvider };
