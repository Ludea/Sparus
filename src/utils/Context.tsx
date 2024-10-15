import { ReactNode, createContext } from "react";
import { Store } from "tauri-plugin-store-api";

type SparusError = {
  globalError: string;
  setGlobalError: (err: string) => void;
};

const SparusErrorContext = createContext<SparusError>({
  globalError: "",
  setGlobalError: () => {},
});

const store = new Store("Sparus.json");

const SparusStoreContext = createContext(store);

function StoreProvider({ children }: { children: ReactNode }) {
  return (
    <SparusStoreContext.Provider value={store}>
      {children}
    </SparusStoreContext.Provider>
  );
}

export { SparusErrorContext, SparusStoreContext, StoreProvider };
