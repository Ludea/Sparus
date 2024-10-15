import { useContext } from "react";
import IconButton from "@mui/material/IconButton";
import Grid from "@mui/material/Grid2";
import { useNavigate, useLocation } from "react-router-dom";

// Icons
import ClearIcon from "@mui/icons-material/Clear";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import MinimizeIcon from "@mui/icons-material/Minimize";
import SettingsIcon from "@mui/icons-material/Settings";

// Components
import { SparusErrorContext } from "utils/Context";

// Tauri api
import { getCurrentWindow } from "@tauri-apps/api/window";

function Header() {
  const { setGlobalError } = useContext(SparusErrorContext);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Grid container>
      <Grid size={1}>
        {location.pathname !== "/" ? (
          <IconButton
            color="primary"
            aria-label="back to Home page"
            onClick={() => navigate("/")}
          >
            <ArrowBackIosIcon fontSize="large" />
          </IconButton>
        ) : null}
      </Grid>
      <Grid
        size={9}
        sx={{ height: 50 }}
        onMouseDown={() => {
          getCurrentWindow()
            .startDragging()
            .catch((err: string) => setGlobalError(err));
        }}
      />
      <Grid
        container
        size={2}
        sx={{
          display: {
            sm: "block",
            xs: "none",
          },
        }}
      >
        <IconButton
          color="primary"
          aria-label="Settings"
          onClick={() => navigate("/options")}
        >
          <SettingsIcon />
        </IconButton>
        <IconButton
          color="primary"
          aria-label="Minimize Sparus"
          onClick={() => {
            getCurrentWindow()
              .minimize()
              .catch((err: string) => setGlobalError(err));
          }}
        >
          <MinimizeIcon />
        </IconButton>
        <IconButton
          color="primary"
          aria-label="Close Sparus"
          onClick={() => {
            getCurrentWindow()
              .hide()
              .catch((err: string) => setGlobalError(err));
          }}
        >
          <ClearIcon />
        </IconButton>
      </Grid>
    </Grid>
  );
}

export default Header;
