import { useState, useEffect, useContext } from "react";
import LinearProgress from "@mui/material/LinearProgress";
import LoadingButton from "@mui/lab/LoadingButton";
import Grid from "@mui/material/Grid2";
import Paper from "@mui/material/Paper";

// Context
import { SparusErrorContext, SparusStoreContext } from "utils/Context";

// Tauri api
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Command } from "@tauri-apps/plugin-shell";
import { platform } from "@tauri-apps/plugin-os";
import { Typography } from "@mui/material";

const host = platform();

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
  const [gameRunning, setGameRunning] = useState<boolean>(false);
  const [workspacePath, setWorkspacePath] = useState<string>("");
  const [gameName, setGameName] = useState<string>("");
  const [repositoryUrl, setRepositoryUrl] = useState<string>();
  const [downloadedBytesStart, setDownloadedBytesStart] = useState("");
  const [downloadedBytesEnd, setDownloadedBytesEnd] = useState("");
  const [downloadedBytesPerSec, setDownloadedBytesPerSec] = useState("");
  const [appliedOutputBytesStart, setAppliedOutputBytesStart] = useState("");
  const [appliedOutputBytesEnd, setAppliedOutputBytesEnd] = useState("");
  const [appliedOutputBytesPerSec, setAppliedOutputBytesPerSec] = useState("");

  const { setGlobalError } = useContext(SparusErrorContext);
  const store = useContext(SparusStoreContext);

  useEffect(() => {
    store
      .get<string>("game_url")
      .then((value) => {
        if (value) setRepositoryUrl(value);
      })
      .catch((err: string) => setGlobalError(err));

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
                .catch((err: string) => setGlobalError(err));
              setWorkspacePath(path.concat(gameSubPath));
            })
            .catch((err: string) => setGlobalError(err));
      })
      .catch((err: string) => setGlobalError(err));

    invoke("check_if_installed", { path: workspacePath })
      .then(() => {
        invoke("get_game_exe_name", {
          path: workspacePath,
        })
          .then((name) => setGameName(name))
          .catch((err) => setGlobalError(err));
        setGameState("installed");
      })
      .catch(() => setGameState("not_installed"));

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
    }).catch((err: string) => setGlobalError(err));
  }, [gameName, store, setGlobalError, workspacePath]);

  const spawn = () => {
    let extension = "";
    let shell: string = "";
    let arg: string[] = [""];

    if (host === "windows") {
      extension = ".exe";
      shell = "cmd";
      arg = ["/C"];
    } else if (host === "linux" || host === "macos") {
      extension = "";
      shell = "sh";
      arg = ["-c"];
    }

    const command = Command.create(shell, [
      ...arg,
      "start ".concat(workspacePath, "/", gameName, extension),
    ]);

    command
      .spawn()
      .then(() => {
        setGameRunning(true);
      })
      .catch((err: string) => setGlobalError(err));
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
        bottom: "10%",
        display: {
          sm: "flex",
          xs: "none",
        },
      }}
    >
      <Grid size={8}>
        {downloadedBytesStart && gameState === "installing" ? (
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
        <LoadingButton
          variant="contained"
          color="primary"
          disabled={gameRunning}
          loading={gameLoading}
          loadingIndicator="Loading... "
          onClick={() => {
            if (gameState === "not_installed") {
              setGameLoading(!gameLoading);
              setGameState("installing");
              invoke("update_workspace", {
                workspacePath,
                repositoryUrl,
              })
                .then(() => {
                  setGameState("installed");
                  setGameLoading(false);
                })
                .catch((err: string) => setGlobalError(err));
            }
            if (gameState === "installed") {
              spawn();
            }
          }}
        >
          {gameState !== "installed" ? "Install" : "Play"}
        </LoadingButton>
      </Grid>
      {downloadedBytesStart && gameState === "installing" ? (
        <Grid
          size={11}
          sx={{ display: "flex" }}
          alignItems="center"
          justifyContent="center"
        >
          <Paper
            sx={{ position: "fixed", bottom: "8%", backgroundColor: "#393e46" }}
            elevation={3}
          >
            <Typography sx={{ color: "white" }}>
              Download: {downloadedBytesStart} / {downloadedBytesEnd} @
              {downloadedBytesPerSec}/s <br /> Write : {appliedOutputBytesStart}{" "}
              /{appliedOutputBytesEnd} @ {appliedOutputBytesPerSec}/s
            </Typography>
          </Paper>
        </Grid>
      ) : null}
    </Grid>
  );
}

export default Footer;
