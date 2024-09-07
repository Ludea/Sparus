import { useEffect, useMemo, useState } from "react";
import Grid from "@mui/material/Grid2";
import { useRoutes } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// components
import Header from "components/Header";
import { DesktopRoutes, MobileRoutes } from "routes";
import DesktopBackground from "assets/DesktopBackground.jpg";
import SparusErrorContext from "utils/Context";

function App() {
  const [globalError, setGlobalError] = useState("");

  const theme = createTheme();
  const DesktopRouting = useRoutes(DesktopRoutes);
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
  }, [globalError]);

  return (
    <SparusErrorContext.Provider value={errorCache}>
      <ThemeProvider theme={theme}>
        <Grid
          container
          spacing={0}
          m={-1}
          sx={{
            height: "100vh",
            width: "100vw",
            backgroundSize: "cover",
            backgroundImage: `url(${DesktopBackground})`,
            display: {
              sm: "block",
              xs: "none",
            },
          }}
        >
          <Grid xs={12}>
            <Header />
          </Grid>
          <Grid xs={12}>{DesktopRouting}</Grid>
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
          {MobileRouting}
        </Grid>
      </ThemeProvider>
    </SparusErrorContext.Provider>
  );
}

export default App;
