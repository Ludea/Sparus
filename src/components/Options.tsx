import { useState, useEffect, useContext } from "react";
import TextField from "@mui/material/TextField";
import Slide from "@mui/material/Slide";
import Grid from "@mui/material/Grid2";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";

// Components
import { SparusErrorContext, SparusStoreContext } from "utils/Context";

// Tauri api
import { remove } from "@tauri-apps/plugin-fs";
import { enable, disable } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import { platform } from "@tauri-apps/plugin-os";

// Icons
import DeleteIcon from "@mui/icons-material/Delete";
import FolderIcon from "@mui/icons-material/Folder";

const host = platform();

function Options() {
  const [gameURL, setGameURL] = useState<string>("");
  const [autostart, setAutostart] = useState<boolean>();
  const [launcherURL, setLauncherURL] = useState<string>("");
  const [workspacePath, setWorkspacePath] = useState<string>("");

  const { setGlobalError } = useContext(SparusErrorContext);
  const store = useContext(SparusStoreContext);

  useEffect(() => {
    store
      .get<string>("game_url")
      .then((value) => {
        if (value) setGameURL(value);
      })
      .catch((err: unknown) => {
        setGlobalError(err);
      });
    store
      .get<string>("launcher_url")
      .then((value) => {
        if (value) setLauncherURL(value);
      })
      .catch((err: unknown) => {
        setGlobalError(err);
      });
    store
      .get<string>("workspace_path")
      .then((value) => {
        if (value) setWorkspacePath(value);
      })
      .catch((err: unknown) => {
        setGlobalError(err);
      });
    store
      .get<boolean>("autostart")
      .then((value) => {
        if (value) setAutostart(value);
      })
      .catch((err: unknown) => {
        setGlobalError(err);
      });
  }, [setGlobalError, store]);

  return (
    <Slide direction="right" in mountOnEnter unmountOnExit>
      <Grid
        container
        alignItems="flex-start"
        direction="column"
        sx={{
          backgroundColor: "#D3D3D3",
          height: 550,
          position: "fixed",
          top: 50,
          zIndex: 30,
          width: 410,
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
            onChange={(event) => {
              setGameURL(event.target.value);
              store
                .set("game_url", event.target.value)
                .catch((err: unknown) => {
                  setGlobalError(err);
                });
            }}
          />
          <TextField
            autoFocus
            margin="dense"
            id="launcher_url"
            label="Launcher download url"
            type="text"
            variant="standard"
            value={launcherURL}
            onChange={(event) => {
              setLauncherURL(event.target.value);
              store
                .set("launcher_url", event.target.value)
                .catch((err: unknown) => {
                  setGlobalError(err);
                });
            }}
          />
          <Grid container>
            <Grid size={11}>
              <TextField
                autoFocus
                margin="dense"
                id="game_path"
                label="Installation Path"
                type="text"
                variant="standard"
                value={workspacePath}
                onChange={(event) => {
                  setWorkspacePath(event.target.value);
                  store
                    .set("workspace_path", event.target.value)
                    .catch((err: unknown) => {
                      setGlobalError(err);
                    });
                }}
              />
            </Grid>
            <Grid size={1} alignContent="end">
              <IconButton
                aria-label="folder"
                onClick={() => {
                  open({
                    multiple: false,
                    directory: true,
                  })
                    .then((dir) => {
                      if (dir) {
                        const gameSubPath =
                          host === "windows" ? "\\game" : "/game";
                        setWorkspacePath(dir.concat(gameSubPath));
                        store
                          .set("workspace_path", dir.concat(gameSubPath))
                          .catch((err: unknown) => {
                            setGlobalError(err);
                          });
                      }
                    })
                    .catch((err: unknown) => {
                      setGlobalError(err);
                    });
                }}
              >
                <FolderIcon fontSize="large" />
              </IconButton>
            </Grid>
          </Grid>
          <FormControlLabel
            control={
              <Checkbox
                checked={autostart}
                onChange={(event) => {
                  setAutostart(event.target.checked);
                  if (autostart) {
                    enable().catch((err: unknown) => {
                      setGlobalError(err);
                    });
                  } else
                    disable().catch((err: unknown) => {
                      setGlobalError(err);
                    });
                  store
                    .set("autostart", event.target.value)
                    .catch((err: unknown) => {
                      setGlobalError(err);
                    });
                }}
                inputProps={{ "aria-label": "controlled" }}
              />
            }
            label="Start Sparus on system boot"
          />
        </Box>
        <IconButton
          aria-label="delete"
          onClick={() => {
            remove("game", { recursive: true }).catch((err: unknown) => {
              setGlobalError(err);
            });
          }}
        >
          <DeleteIcon />
        </IconButton>
      </Grid>
    </Slide>
  );
}

export default Options;
