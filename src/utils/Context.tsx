import {createContext } from 'react';
import { Stronghold } from "tauri-plugin-stronghold";

const SparusContext = createContext(Stronghold);

export default SparusContext ;