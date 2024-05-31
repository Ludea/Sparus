import { createContext } from "react";

const SparusErrorContext = createContext({
  error: "",
  setError: () => {},
});

export default SparusErrorContext;
