import { useEffect, useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import AppBar from "@mui/material/AppBar";

import { useRoutes } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// components
import Header from "components/Header";
import routes from "routes";
import DesktopBackground from "assets/DesktopBackground.jpg";
import MobileBackground from "assets/MobileBackground.jpg";
import SparusErrorContext from "utils/Context";

// Icons
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import HomeIcon from "@mui/icons-material/Home";

function HomePanel({ value, index }: { value: number; index: number }) {
  return value === index ? (
    <Grid
      sx={{
        display: {
          sm: "none",
          xs: "block",
        },
        height: "93%",
        width: "100vw",
        backgroundSize: "cover",
        backgroundImage: `url(${MobileBackground})`,
      }}
    />
  ) : null;
}

function App() {
  const [globalError, setGlobalError] = useState("");
  const [currentTab, setCurrentTab] = useState(0);

  const theme = createTheme();
  const routing = useRoutes(routes);

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
          <Grid item xs={12}>
            <Header />
          </Grid>
          <Grid item xs={12}>
            {routing}
          </Grid>
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
          <HomePanel value={currentTab} index={0} />
          <AppBar
            position="fixed"
            sx={{
              top: "auto",
              bottom: 0,
              display: {
                sm: "none",
                xs: "block",
              },
            }}
          >
            <Tabs
              indicatorColor="secondary"
              textColor="inherit"
              variant="fullWidth"
              value={currentTab}
              aria-label="menu tab"
              onChange={(_, tab: number) => setCurrentTab(tab)}
            >
              <Tab icon={<HomeIcon fontSize="large" />} aria-label="home" />
              <Tab
                icon={<AccountCircleIcon fontSize="large" />}
                aria-label="account"
              />
            </Tabs>
          </AppBar>
        </Grid>
      </ThemeProvider>
    </SparusErrorContext.Provider>
  );
}

export default App;
