import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

const doc = document.getElementById("root") as Element;
const root = ReactDOM.createRoot(doc);

root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
