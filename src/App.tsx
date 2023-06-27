import { useEffect, useState } from "react";
import Grid from "@mui/material/Grid";

import { useRoutes } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// components
import Header from "components/Header";
import routes from "routes";
import Background from "assets/background.jpg";
import SparusContext from "utils/Context";

function App() {
  const [error, setError] = useState("");
  const value = { error, setError };
  const theme = createTheme();
  const routing = useRoutes(routes);

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
  }, []);
  return (
    <SparusContext.Provider value={value}>
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
    </SparusContext.Provider>
  );
}

export default App;
