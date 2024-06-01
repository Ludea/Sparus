import { createContext } from "react";

type SparusError = {
  globalError: string;
  setGlobalError: (err: string) => void;
};

const SparusErrorContext = createContext<SparusError>({
  globalError: "",
  setGlobalError: () => {},
});

export default SparusErrorContext;
