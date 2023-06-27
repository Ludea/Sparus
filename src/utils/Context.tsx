import { createContext } from "react";

const SparusContext = createContext({
  error: "",
  setError: (error: string) => {},
});

export default SparusContext;
