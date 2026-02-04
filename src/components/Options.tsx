import { useState, useEffect, useContext } from "react";
import TextField from "@mui/material/TextField";
import Slide from "@mui/material/Slide";
import Grid from "@mui/material/Grid";
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

interface SparusError {
  kind: string;
  message: string;
}

const host = platform();

function Options() {
  const [autostart, setAutostart] = useState<boolean>();
  const [repositoryUrl, setRepositoryUrl] = useState<string>("");
  const [workspacePath, setWorkspacePath] = useState<string>("");

  const { setGlobalError } = useContext(SparusErrorContext);
  const store = useContext(SparusStoreContext);

  useEffect(() => {
    Promise.all([
      store.get<string>("repository_url"),
      store.get<string>("workspace_path"),
      store.get<boolean>("autostart"),
    ])
      .then(([repository_url, workspace_path, autostart]) => {
        if (repository_url) setRepositoryUrl(repository_url);
        if (workspace_path) setWorkspacePath(workspace_path);
        if (autostart) setAutostart(autostart);
      })
      .catch((err: unknown) => {
        setGlobalError(
          (err as SparusError).kind.concat(": ", (err as SparusError).message),
        );
      });
  });

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
            id="repository_url"
            label="Repository url"
            type="text"
            variant="standard"
            value={repositoryUrl}
            onChange={(event) => {
              setRepositoryUrl(event.target.value);
              store
                .set("repository_url", event.target.value)
                .catch((err: unknown) => {
                  setGlobalError(
                    (err as SparusError).kind.concat(
                      ": ",
                      (err as SparusError).message,
                    ),
                  );
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
                      setGlobalError(
                        (err as SparusError).kind.concat(
                          ": ",
                          (err as SparusError).message,
                        ),
                      );
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
                            setGlobalError(
                              (err as SparusError).kind.concat(
                                ": ",
                                (err as SparusError).message,
                              ),
                            );
                          });
                      }
                    })
                    .catch((err: unknown) => {
                      setGlobalError(
                        (err as SparusError).kind.concat(
                          ": ",
                          (err as SparusError).message,
                        ),
                      );
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
                      setGlobalError(
                        (err as SparusError).kind.concat(
                          ": ",
                          (err as SparusError).message,
                        ),
                      );
                    });
                  } else
                    disable().catch((err: unknown) => {
                      setGlobalError(
                        (err as SparusError).kind.concat(
                          ": ",
                          (err as SparusError).message,
                        ),
                      );
                    });
                  store
                    .set("autostart", event.target.value)
                    .catch((err: unknown) => {
                      setGlobalError(err);
                    });
                }}
                slotProps={{
                  input: {
                    "aria-label": "controlled",
                  },
                }}
              />
            }
            label="Start Sparus on system boot"
          />
        </Box>
        <IconButton
          aria-label="delete"
          onClick={() => {
            remove("game", { recursive: true }).catch((err: unknown) => {
              setGlobalError(
                (err as SparusError).kind.concat(
                  ": ",
                  (err as SparusError).message,
                ),
              );
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
