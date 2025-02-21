import { useState, useEffect, useContext } from "react";
import LinearProgress from "@mui/material/LinearProgress";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid2";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

// Context
import { SparusErrorContext, SparusStoreContext } from "utils/Context";

// Tauri api
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Command, SpawnOptions } from "@tauri-apps/plugin-shell";
import { arch, platform } from "@tauri-apps/plugin-os";

const host = platform();
const architecture = arch();

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

function Footer() {
  const [progress, setProgress] = useState(0);
  const [buffer, setBuffer] = useState(0);
  const [gameState, setGameState] = useState("not_installed");
  const [gameLoading, setGameLoading] = useState<boolean>(false);
  const [workspacePath, setWorkspacePath] = useState<string>("");
  const [gameName, setGameName] = useState<string>("kataster");
  const [repositoryUrl, setRepositoryUrl] = useState<string>();
  const [downloadedBytesStart, setDownloadedBytesStart] = useState("");
  const [downloadedBytesEnd, setDownloadedBytesEnd] = useState("");
  const [downloadedBytesPerSec, setDownloadedBytesPerSec] = useState("");
  const [appliedOutputBytesStart, setAppliedOutputBytesStart] = useState("");
  const [appliedOutputBytesEnd, setAppliedOutputBytesEnd] = useState("");
  const [appliedOutputBytesPerSec, setAppliedOutputBytesPerSec] = useState("");

  const { setGlobalError } = useContext(SparusErrorContext);
  const store = useContext(SparusStoreContext);
  const theme = useTheme();

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

  useEffect(() => {
    store
      .get<string>("game_url")
      .then((value) => {
        if (value) setRepositoryUrl(value);
      })
      .catch((err: unknown) => {
        setGlobalError(err);
      });

    store
      .get<string>("workspace_path")
      .then((value) => {
        if (value) setWorkspacePath(value);
        else
          invoke<string>("get_current_path")
            .then((path) => {
              const gameSubPath = host === "windows" ? "\\game" : "/game";
              store
                .set("workspace_path", path.concat(gameSubPath))
                .catch((err: unknown) => {
                  setGlobalError(err);
                });
              setWorkspacePath(path.concat(gameSubPath));
            })
            .catch((err: unknown) => {
              setGlobalError(err);
            });
      })
      .catch((err: unknown) => {
        setGlobalError(err);
      });

    invoke("check_if_installed", { path: workspacePath })
      .then(() => {
        invoke<string>("get_game_exe_name", {
          path: workspacePath,
        })
          .then((name) => {
            setGameName(name);
          })
          .catch((err: unknown) => {
            setGlobalError(err);
          });
        setGameState("installed");
      })
      .catch(() => {
        setGameState("not_installed");
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
  }, [gameName, store, setGlobalError, workspacePath]);

  const spawn = () => {
    const opts: SpawnOptions = {
      env: { CARGO_MANIFEST_DIR: workspacePath },
    };
    const command = Command.create(
      shell,
      [...arg, workspacePath.concat("/", gameName)],
      opts,
    );

    command.spawn().catch((err: unknown) => {
      console.log(err);
    });
  };

  return (
    <Grid
      size={11}
      container
      justifyContent="center"
      alignItems="center"
      spacing={4}
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
        {gameState === "installing" ? (
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
      <Grid>
        <Button
          variant="contained"
          color="primary"
          //disabled={gameRunning}
          loading={gameLoading}
          sx={{
            "&.Mui-disabled": {
              backgroundColor: theme.palette.primary.main,
            },
          }}
          loadingIndicator={<CircularProgress color="secondary" size={22} />}
          onClick={() => {
            if (gameState === "not_installed") {
              setGameLoading(true);
              setGameState("installing");
              invoke("update_workspace", {
                workspacePath,
                repositoryUrl: repositoryUrl?.concat(
                  "/",
                  gameName,
                  "/",
                  platform,
                  "/",
                ),
              })
                .then(() => {
                  setGameState("installed");
                  setGameLoading(false);
                  setAppliedOutputBytesPerSec("");
                })
                .catch((err: unknown) => {
                  setGameState("not_installed ");
                  setGameLoading(false);
                  setGlobalError(err);
                });
            }
            if (gameState === "installed") {
              spawn();
            }
          }}
        >
          {gameState !== "installed" ? "Install" : "Play"}
        </Button>
      </Grid>
      {gameState === "installing" ? (
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
