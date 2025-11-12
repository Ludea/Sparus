import { useEffect, useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import { useRoutes } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// components
import Header from "components/Header";
import { DesktopRoutes, MobileRoutes } from "routes";
import DesktopBackground from "assets/DesktopBackground.jpg";
import { SparusErrorContext, StoreProvider } from "utils/Context";
import { PluginManager } from "components/PluginManager";

function App() {
  const [globalError, setGlobalError] = useState<unknown>();

  const theme = createTheme();
  const DesktopRouting = useRoutes(DesktopRoutes("allo"));
  const MobileRouting = useRoutes(MobileRoutes);

  const errorCache = useMemo(
    () => ({
      globalError,
      setGlobalError,
    }),
    [globalError, setGlobalError],
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
    }
  }, [globalError]);

  const getSection = (text: string) => {
    console.log("message from plugin: ", text);
  };

  return (
    <SparusErrorContext.Provider value={errorCache}>
      <StoreProvider>
        <ThemeProvider theme={theme}>
          <Grid
            container
            spacing={0}
            m={-1}
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
              <PluginManager section={getSection} />
              <Header />
            </Grid>
            {DesktopRouting}
          </Grid>
          <Grid
            container
            spacing={0}
            m={-1}
            sx={{
              height: "100vh",
              width: "100vw",
              display: {
                sm: "none",
                xs: "block",
              },
            }}
          >
            {MobileRouting}{" "}
          </Grid>
        </ThemeProvider>
      </StoreProvider>
    </SparusErrorContext.Provider>
  );
}

export default App;
