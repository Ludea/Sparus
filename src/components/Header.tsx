import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import { useNavigate, useLocation } from "react-router-dom";

// Icons
import ClearIcon from "@mui/icons-material/Clear";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import MinimizeIcon from "@mui/icons-material/Minimize";
import SettingsIcon from "@mui/icons-material/Settings";

// Tauri api
import { appWindow } from "@tauri-apps/api/window";

function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Grid container sx={{height: 50}}>
      <Grid item xs={9.7} onMouseDown={() => appWindow.startDragging()}>
        {location.pathname !== "/" ? (
          <IconButton
            color="primary"
            aria-label="back to Home page"
            onClick={() => navigate("/")}
          >
            <ArrowBackIosIcon />
          </IconButton>
        ) : null}
      </Grid>
      <Box
        sx={{
          position: "fixed",
          right: 0,
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
          onClick={() => appWindow.minimize()}
        >
          <MinimizeIcon />
        </IconButton>
        <IconButton
          color="primary"
          aria-label="Close Sparus"
          onClick={() => appWindow.close()}
        >
          <ClearIcon />
        </IconButton>
      </Box>
    </Grid>
  );
}

export default Header;
