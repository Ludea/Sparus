import { useState, useEffect, useContext, useRef } from "react";
import LinearProgress from "@mui/material/LinearProgress";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import ButtonGroup from "@mui/material/ButtonGroup";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Grow from "@mui/material/Grow";
import Popper from "@mui/material/Popper";
import MenuItem from "@mui/material/MenuItem";
import MenuList from "@mui/material/MenuList";
import Tooltip from "@mui/material/Tooltip";

//Icons
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ErrorIcon from "@mui/icons-material/WarningRounded";

// Context
import { SparusErrorContext, SparusStoreContext } from "utils/Context";

// Tauri api
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { Command, SpawnOptions } from "@tauri-apps/plugin-shell";
import { arch, platform } from "@tauri-apps/plugin-os";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

interface UpdateError {
  UpdateErr: {
    description: "";
  };
}

interface GameError {
  kind: string;
  message: string;
}

const host = platform();
const architecture = arch();
type GameState =
  | "update_available"
  | "play"
  | "updating"
  | "not_installed"
  | "idle";
type LauncherState = "update_available" | "restart" | "updating" | "idle";
type LabelSource = "game" | "launcher";
const gameLabelByState: Record<GameState, string> = {
  update_available: "Update Game",
  play: "Play",
  updating: "",
  not_installed: "Install Game",
  idle: "",
};

const launcherLabelByState: Record<LauncherState, string> = {
  update_available: "Update launcher",
  restart: "Restart launcher",
  updating: "",
  idle: "",
};

interface UpdateEvent {
  download: number;
  write: number;
  downloaded_bytes_start: number;
  downloaded_bytes_per_sec: number;
  downloaded_bytes_end: number;
  applied_output_bytes_start: number;
  applied_output_bytes_end: number;
  applied_output_bytes_per_sec: number;
}

const convertReadableData = (data: number): string => {
  if (data > 1024 && data < 1024 * 1024) {
    return `${String(Math.floor((data / 1024) * 100) / 100)} kiB`;
  }
  if (data > 1024 * 1024 && data < 1024 * 1024 * 1024) {
    return `${String(Math.floor((data / (1024 * 1024)) * 100) / 100)} MiB`;
  }
  if (data > 1024 * 1024 * 1024) {
    return `${String(
      Math.floor((data / (1024 * 1024 * 1024)) * 100) / 100,
    )} GiB`;
  }
  return "";
};

async function checkPermission() {
  if (!(await isPermissionGranted())) {
    return (await requestPermission()) === "granted";
  }
  return true;
}

function Footer() {
  const [progress, setProgress] = useState(0);
  const [buffer, setBuffer] = useState(0);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [launcherState, setLauncherState] = useState<LauncherState>("idle");
  const [activeSource, setActiveSource] = useState<LabelSource>("game");
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState(false);
  const [workspacePath, setWorkspacePath] = useState<string>("");
  const [gameName, setGameName] = useState<string>("");
  const [repositoryName, setRepositoryName] = useState<string>("");
  const [repositoryUrl, setRepositoryUrl] = useState<string>("");
  const [downloadedBytesStart, setDownloadedBytesStart] = useState("");
  const [downloadedBytesEnd, setDownloadedBytesEnd] = useState("");
  const [downloadedBytesPerSec, setDownloadedBytesPerSec] = useState("");
  const [appliedOutputBytesStart, setAppliedOutputBytesStart] = useState("");
  const [appliedOutputBytesEnd, setAppliedOutputBytesEnd] = useState("");
  const [appliedOutputBytesPerSec, setAppliedOutputBytesPerSec] = useState("");

  const { setGlobalError, globalError } = useContext(SparusErrorContext);
  const store = useContext(SparusStoreContext);
  const anchorRef = useRef<HTMLDivElement>(null);
  const gameLabel = gameLabelByState[gameState];
  const launcherLabel = launcherLabelByState[launcherState];
  const activeLabel = activeSource === "game" ? gameLabel : launcherLabel;
  const alternativeLabel = activeSource === "game" ? launcherLabel : gameLabel;

  let platform = "";
  let shell = "";
  let arg: string[] = [""];

  if (host === "windows") {
    shell = "cmd";
    arg = ["/C"];
    platform = "win64";
  } else if (host === "linux") {
    platform = "linux";
    shell = "sh";
    arg = ["-c"];
  } else if (host === "macos") {
    shell = "sh";
    arg = ["-c"];
    if (architecture === "x86_64") {
      platform = "macos_x86_64";
    }
    if (architecture === "aarch64") {
      platform = "macos_arm64";
    }
  }

  const closeMenu = (event: Event) => {
    if (anchorRef.current?.contains(event.target as HTMLElement)) {
      return;
    }

    setOpen(false);
  };

  const install_update = (type: string) => {
    if (type === "launcher") setLauncherState("updating");
    if (type === "game") setGameState("updating");
    let workdirSubPath = "";
    if (type === "game")
      workdirSubPath = host === "windows" ? "\\game" : "/game";

    invoke("update_workspace", {
      workspacePath: workspacePath.concat(workdirSubPath),
      repositoryUrl: repositoryUrl.concat(
        "/",
        repositoryName,
        "/",
        type,
        "/",
        platform,
        "/",
      ),
    })
      .then(() => {
        if (type === "launcher") setLauncherState("restart");
        if (type === "game") setGameState("play");
        setLoading(false);
        setAppliedOutputBytesPerSec("");
      })
      .catch((err: unknown) => {
        if (err && typeof err === "object" && "UpdateErr" in err) {
          setGlobalError((err as UpdateError).UpdateErr.description);
        }
        if (type === "launcher") setLauncherState("update_available");
        if (type === "game") setGameState("not_installed");
        setLoading(false);
      });
  };

  useEffect(() => {
    Promise.all([
      store.get<string>("games"),
      store.get<string>("repository_name"),
      store.get<string>("repository_url"),
      store.get<string>("workspace_path"),
    ])
      .then(([games, repository_name, repository_url, workspace_path]) => {
        if (games) setGameName(games[0]);
        if (repository_name) setRepositoryName(repository_name);
        if (repository_url) setRepositoryUrl(repository_url);
        if (workspace_path !== undefined) setWorkspacePath(workspace_path);
        else {
          invoke<string>("get_current_path")
            .then((path) => {
              store.set("workspace_path", path).catch((err: unknown) => {
                setGlobalError(err);
              });
              setWorkspacePath(path);
            })
            .catch((err: unknown) => {
              setGlobalError(err);
            });
        }

        const workdirSubPath = host === "windows" ? "\\game" : "/game";
        invoke<string>("get_game_exe_name", {
          path: workspace_path?.concat(workdirSubPath),
        })
          .then((name) => {
            setGameName(name);
            setGameState("play");
          })
          .catch((err: unknown) => {
            if (
              err &&
              typeof err === "object" &&
              "kind" in err &&
              "message" in err
            ) {
              if ((err as GameError).kind !== "notInstalled")
                setGlobalError((err as GameError).message);
            }
            setGameState("not_installed");
          });

        const repo_name = repository_name ?? "";
        invoke("update_available", {
          repositoryUrl: repository_url?.concat(
            "/",
            repo_name,
            "/launcher/",
            platform,
            "/",
          ),
        })
          .then((is_available) =>
            is_available
              ? checkPermission()
                  .then((is_allowed) => {
                    if (is_allowed) {
                      setLauncherState("update_available");
                      sendNotification({
                        title: "Update available !",
                        body: "An update is available",
                      });
                    }
                  })
                  .catch((err: unknown) => {
                    setGlobalError(err);
                  })
              : null,
          )
          .catch((err: unknown) => {
            if (err && typeof err === "object" && "UpdateErr" in err) {
              setGlobalError((err as UpdateError).UpdateErr.description);
            }
          });

        if (gameState === "play")
          invoke("update_available", {
            repositoryUrl: repository_url?.concat(
              "/",
              repo_name,
              "/game/",
              platform,
              "/",
            ),
          })
            .then((is_available) =>
              is_available
                ? checkPermission()
                    .then((is_allowed) => {
                      if (is_allowed) {
                        setGameState("update_available");
                        sendNotification({
                          title: "Update available !",
                          body: "An update is available",
                        });
                      }
                    })
                    .catch((err: unknown) => {
                      if (
                        err &&
                        typeof err === "object" &&
                        "UpdateErr" in err
                      ) {
                        setGlobalError(
                          (err as UpdateError).UpdateErr.description,
                        );
                      }
                    })
                : null,
            )
            .catch((err: unknown) => {
              setGlobalError(err);
            });
      })
      .catch((err: unknown) => {
        setGlobalError(err);
      });

    listen<UpdateEvent>("sparus://downloadinfos", (event) => {
      setProgress(
        (event.payload.downloaded_bytes_start /
          event.payload.downloaded_bytes_end) *
          100,
      );
      setBuffer(
        (event.payload.applied_output_bytes_start /
          event.payload.applied_output_bytes_end) *
          100,
      );
      setDownloadedBytesStart(
        convertReadableData(event.payload.downloaded_bytes_start),
      );
      setDownloadedBytesEnd(
        convertReadableData(event.payload.downloaded_bytes_end),
      );
      setDownloadedBytesPerSec(
        convertReadableData(event.payload.downloaded_bytes_per_sec),
      );
      setAppliedOutputBytesStart(
        convertReadableData(event.payload.applied_output_bytes_start),
      );
      setAppliedOutputBytesEnd(
        convertReadableData(event.payload.applied_output_bytes_end),
      );
      setAppliedOutputBytesPerSec(
        convertReadableData(event.payload.applied_output_bytes_per_sec),
      );
    }).catch((err: unknown) => {
      setGlobalError(err);
    });
  }, []);

  const spawn = () => {
    const opts: SpawnOptions = {
      env: { CARGO_MANIFEST_DIR: workspacePath.concat("/game/") },
    };
    const command = Command.create(
      shell,
      [...arg, workspacePath.concat("/game/", gameName)],
      opts,
    );

    command.spawn().catch((err: unknown) => {
      setGlobalError(err);
    });
  };

  return (
    <Grid
      size={12}
      container
      justifyContent="center"
      alignItems="center"
      spacing={3}
      sx={{
        position: "fixed",
        bottom: "15%",
        display: {
          sm: "flex",
          xs: "none",
        },
      }}
    >
      <Grid size={8}>
        {gameState === "updating" ? (
          <LinearProgress
            variant="buffer"
            value={buffer}
            valueBuffer={progress}
            sx={{
              height: 20,
              borderRadius: 5,
              "& .MuiLinearProgress-dashed": {
                backgroundColor: "lightgrey",
                backgroundImage: "none",
                animation: "none",
              },
            }}
          />
        ) : null}
      </Grid>
      <Grid
        container
        size={5}
        spacing={1}
        sx={{
          alignItems: "center",
          position: "fixed",
          right: 10,
        }}
      >
        <ButtonGroup
          variant="contained"
          ref={anchorRef}
          aria-label="play_update_install"
        >
          <Button
            loading={loading}
            loadingIndicator={<CircularProgress color="secondary" size={22} />}
            sx={{
              width: 200,
            }}
            onClick={() => {
              setGlobalError(null);
              if (activeSource === "launcher")
                switch (launcherState) {
                  case "restart":
                    relaunch().catch((err: unknown) => {
                      setGlobalError(err);
                    });
                    break;
                  case "update_available":
                    install_update("launcher");
                    break;
                  default:
                }
              if (activeSource === "game")
                switch (gameState) {
                  case "play":
                    spawn();
                    break;
                  case "not_installed":
                    install_update("game");
                    break;
                  case "update_available":
                    install_update("game");
                    break;
                  default:
                }
            }}
          >
            {activeLabel}
          </Button>
          {launcherState === "update_available" ||
          launcherState === "restart" ? (
            <Button
              size="small"
              aria-controls={open ? "split-button-menu" : undefined}
              aria-expanded={open ? "true" : undefined}
              aria-label="play"
              aria-haspopup="menu"
              onClick={() => {
                setOpen((prevOpen) => !prevOpen);
              }}
            >
              <ArrowDropDownIcon />
            </Button>
          ) : null}
        </ButtonGroup>
        <Popper
          sx={{ zIndex: 1 }}
          open={open}
          anchorEl={anchorRef.current}
          role={undefined}
          transition
          disablePortal
        >
          {({ TransitionProps, placement }) => (
            <Grow
              {...TransitionProps}
              style={{
                transformOrigin:
                  placement === "bottom" ? "center top" : "center bottom",
              }}
            >
              <Paper>
                <ClickAwayListener onClickAway={closeMenu}>
                  <MenuList id="split-button-menu" autoFocusItem>
                    <MenuItem
                      selected={true}
                      onClick={() => {
                        setActiveSource(
                          activeSource === "game" ? "launcher" : "game",
                        );
                        setOpen(false);
                      }}
                    >
                      {alternativeLabel}
                    </MenuItem>
                  </MenuList>
                </ClickAwayListener>
              </Paper>
            </Grow>
          )}
        </Popper>
        {globalError ? (
          <Tooltip title={JSON.stringify(globalError)}>
            <ErrorIcon />
          </Tooltip>
        ) : null}
      </Grid>
      {gameState === "updating" ? (
        <Grid
          size={11}
          sx={{ display: "flex", position: "fixed", bottom: "8%" }}
          alignItems="center"
          justifyContent="center"
        >
          <Paper
            sx={{ position: "fixed", bottom: "8%", backgroundColor: "#393e46" }}
            elevation={3}
          >
            <Typography sx={{ color: "white" }}>
              Download: {downloadedBytesStart} / {downloadedBytesEnd} @{" "}
              {downloadedBytesPerSec}/s
              <br />
              Write : {appliedOutputBytesStart} / {appliedOutputBytesEnd} @{" "}
              {appliedOutputBytesPerSec}/s
            </Typography>
          </Paper>
        </Grid>
      ) : null}
    </Grid>
  );
}

export default Footer;
