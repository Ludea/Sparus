import { useEffect } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import { useRoutes } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// components
import Header from "components/Header";
import routes from "routes";
import Background from 'assets/background.jpg';

function App() {
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
  });

  return (
    <ThemeProvider theme={theme}>
      <Box
        m={-1}
        sx={{
	  height: 600,
          backgroundImage: `url(${Background})`,
	  backgroundSize: 'contain',
	  backgroundRepeat: 'no-repeat',
        }}
      >
        <Grid container spacing={0}>
          <Grid item xs={12}>
            <Header />
          </Grid>
          <Box
            sx={{
              display: "flex",
              height: 500,
              width: "100%",
              position: "fixed",
              top: "10%",
            }}
          >
            <Grid item xs={12}>
              {routing}
            </Grid>
          </Box>
        </Grid>
      </Box>
    </ThemeProvider>
  );
}

export default App;
