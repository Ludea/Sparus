import React, { useEffect, useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import CssBaseline from "@mui/material/CssBaseline";
import GlobalStyles from "@mui/material/GlobalStyles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useRoutes } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// components
import Header from "components/Header";
import { DesktopRoutes, MobileRoutes } from "routes";
import DesktopBackground from "assets/DesktopBackground.jpg";
import { SparusErrorContext, StoreProvider } from "utils/Context";
import { PluginManager } from "components/PluginsManager";

//OTA Api
import { checkUpdate, applyUpdate, notifyReady } from "tauri-plugin-hotswap-api";

import type { SparusError, SparusErrorContextType } from "utils/Context";

function App() {
  const [globalError, setGlobalError] = useState<SparusError>();

  const theme = createTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("sm"));
  const Routing = useRoutes(isDesktop ? DesktopRoutes : MobileRoutes);

  const errorCache = useMemo<SparusErrorContextType>(
    () => ({
      globalError,
      setGlobalError: (err: unknown) => setGlobalError(err as SparusError),
    }),
    [globalError],
  );

  useEffect(() => {
    if (import.meta.env.DEV) {
      window.addEventListener("keydown", (event) => {
        if (
          event.key === "F5" ||
          (event.ctrlKey && event.key === "g") ||
          (event.ctrlKey && event.key === "f")
        ) {
          event.preventDefault();
        }
      });

      notifyReady()
        .then(() => {
          checkUpdate()
            .then((result) => {
              if (result.available) {
                applyUpdate()
                  .then(() => {
                    window.location.reload();
                  })
                  .catch((error) => {
                    setGlobalError({ kind: "update", message: "Failed to apply update: " + error });
                  });
              }
            })
            .catch((error) => {
              setGlobalError({ kind: "update", message: "Failed to check for updates: " + error });
            });
        })
        .catch((error) => {
          setGlobalError({ kind: "update", message: "Failed to notify ready: " + error });
        });
    }
  }, [globalError]);

  return (
    <SparusErrorContext.Provider value={errorCache}>
      <StoreProvider>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <GlobalStyles
            styles={{
              "html, body, #root": {
                margin: 0,
                padding: 0,
                height: "100%",
                overflow: "hidden",
              },
            }}
          />
          <PluginManager>
            <Grid
              container
              spacing={0}
              sx={{
                height: 600,
                width: 800,
                backgroundSize: "cover",
                backgroundImage: `url(${DesktopBackground})`,
                display: {
                  sm: "block",
                  xs: "none",
                },
              }}
            >
              <Grid>
                <Header />
              </Grid>
              {isDesktop ? Routing : null}
            </Grid>
            <Grid
              container
              spacing={0}
              sx={{
                height: "100vh",
                width: "100vw",
                display: {
                  sm: "none",
                  xs: "block",
                },
              }}
            >
              {isDesktop ? null : Routing}
            </Grid>
          </PluginManager>
        </ThemeProvider>
      </StoreProvider>
    </SparusErrorContext.Provider>
  );
}

export default App;
