import { useEffect, useMemo, useState } from "react";
import Grid from "@mui/material/Grid";

import { useRoutes } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// Tauri API
import { Stronghold } from "tauri-plugin-stronghold";
import { appConfigDir } from "@tauri-apps/api/path";

// components
import Header from "components/Header";
import routes from "routes";
import Background from "assets/background.jpg";
import SparusErrorContext from "utils/Context";

function App() {
  const [error, setError] = useState();
  const [localConfigDir, setLocalConfigDir] = useState("");
  const theme = createTheme();
  const routing = useRoutes(routes);

  const errorCache = useMemo(() => ({
    error, setError}), [error, setError]);

  appConfigDir()
    .then((dir) => setLocalConfigDir(dir))
    .catch((err: string) => setError(err));

  Stronghold.load(`${localConfigDir}config.stronghold`, "password").catch(
    (err: string) => setError(err),
  );

  useEffect(() => {
    if (import.meta.env.DEV) {
      // window.addEventListener("contextmenu", event => event.preventDefault());
      window.addEventListener("keydown", (event) => {
        if (
          event.key === "F5" ||
          (event.ctrlKey && event.key === "g") ||
          (event.ctrlKey && event.key === "f")
        ) {
          event.preventDefault();
        }
      });
    }
  }, [error]);

  return (
    <SparusErrorContext.Provider value={errorCache}>
      <ThemeProvider theme={theme}>
        <Grid
          container
          spacing={0}
          m={-1}
          sx={{
            height: 600,
            width: 800,
            backgroundImage: `url(${Background})`,
          }}
        >
          <Grid item xs={12}>
            <Header />
          </Grid>
          <Grid item xs={12}>
            {routing}
          </Grid>
        </Grid>
      </ThemeProvider>
    </SparusErrorContext.Provider>
  );
}

export default App;
