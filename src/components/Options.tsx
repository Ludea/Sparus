import { useState, useEffect } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Slide from "@mui/material/Slide";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";

// Components
import { Load, Save } from "utils/Storage";
import { invoke } from "@tauri-apps/api/tauri";
import { removeDir } from "@tauri-apps/api/fs";

// Icons
import DeleteIcon from "@mui/icons-material/Delete";

function Options() {
  const [gameURL, setGameURL] = useState<string>("");
  const [launcherURL, setLauncherURL] = useState<string>("");
  const [workspacePath, setWorkspacePath] = useState<string>("");

  useEffect(() => {
    Load("game_url")
      .then((value) => {
        setGameURL(value);
      })
      .catch();
    Load("launcher_url")
      .then((value) => {
        setLauncherURL(value);
      })
      .catch();
  }, []);

  return (
    <Slide direction="right" in mountOnEnter unmountOnExit>
      <Grid
        container
        alignItems="flex-start"
        direction="column"
        sx={{
          backgroundColor: "#363f45",
          height: "120%",
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
        </Box>
        <Button
          variant="contained"
          color="primary"
          type="submit"
          onClick={() => {
            Save("game_url", gameURL);
            Save("launcher_url", launcherURL);
            Save("workspace_path", workspacePath);
          }}
          sx={{
            position: "absolute",
            bottom: -20,
            right: "20px",
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
