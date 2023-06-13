import { useState, useEffect, useContext } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Slide from "@mui/material/Slide";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";

// Components
import { Load, Save } from "utils/Storage";
import { removeDir } from "@tauri-apps/api/fs";
import { enable, disable } from "tauri-plugin-autostart-api";

// Icons
import DeleteIcon from "@mui/icons-material/Delete";

// Context
 import SparusContext from 'utils/Context';

function Options() {
  const [gameURL, setGameURL] = useState<string>("");
  const [autostart, setAutostart] = useState<boolean>();
  const [launcherURL, setLauncherURL] = useState<string>("");
  const [workspacePath, setWorkspacePath] = useState<string>("");

   const stronghold = useContext(SparusContext);

  useEffect(() => {
    Load(stronghold, "game_url")
      .then((value) => {
        setGameURL(value);
      })
      .catch((error) => console.log("15 : " + error));
    Load(stronghold, "launcher_url")
      .then((value) => {
        setLauncherURL(value);
      })
      .catch((error) => console.log("16 : " + error));
  }, []);

  return (
    <Slide direction="right" in mountOnEnter unmountOnExit>
      <Grid
        container
        alignItems="flex-start"
        direction="column"
        sx={{
          backgroundColor: "#363f45",
          height: 550,
          position: "fixed",
          top: 50,
          zIndex: 30,
        }}
      >
        <Box
          component="form"
          sx={{
            "& .MuiTextField-root": { m: 1, width: "100%" },
          }}
          noValidate
          autoComplete="off"
        >
          <TextField
            autoFocus
            margin="dense"
            id="game_url"
            label="Game download url"
            type="text"
            variant="standard"
            value={gameURL}
            onChange={(event) => setGameURL(event.target.value)}
          />
          <TextField
            autoFocus
            margin="dense"
            id="launcher_url"
            label="Launcher download url"
            type="text"
            variant="standard"
            value={launcherURL}
            onChange={(event) => setLauncherURL(event.target.value)}
          />
          <TextField
            autoFocus
            margin="dense"
            id="game_path"
            label="Installation Path"
            type="text"
            variant="standard"
            value={workspacePath}
            onChange={(event) => setWorkspacePath(event.target.value)}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={autostart}
                onChange={(event) => {
                  setAutostart(event.target.checked);
                  if (event.target.checked) {
                    enable();
                  } else disable();
                }}
                inputProps={{ "aria-label": "controlled" }}
              />
            }
            label="Start Sparus on system boot"
          />
        </Box>
        <Button
          variant="contained"
          color="primary"
          type="submit"
          onClick={() => {
            Save("game_url", gameURL).catch(() => {});
            Save("launcher_url", launcherURL).catch(() => {});
            Save("workspace_path", workspacePath).catch(() => {});
          }}
          sx={{
            position: "absolute",
            bottom: 30,
            right: "40px",
          }}
        >
          Save
        </Button>
        <IconButton
          aria-label="delete"
          onClick={() => removeDir("game", { recursive: true })}
        >
          <DeleteIcon />
        </IconButton>
      </Grid>
    </Slide>
  );
}

export default Options;
