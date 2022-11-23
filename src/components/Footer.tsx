import { useState, useEffect } from "react";
import LinearProgress from "@mui/material/LinearProgress";
import LoadingButton from "@mui/lab/LoadingButton";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";

// Tauri api
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { Command } from "@tauri-apps/api/shell";
import { platform } from "@tauri-apps/api/os";

// Components
import { Load } from "utils/Storage";

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

const convert_readable_data = (data: number): string => {
  if (data > 1024 && data < 1024 * 1024) {
    return `${String(Math.floor((data / 1024) * 100) / 100)} kiB`;
  }
  if (data > 1024 * 1024 && data < 1024 * 1024 * 1024) {
    return `${String(Math.floor((data / (1024 * 1024)) * 100) / 100)} MiB`;
  }
  if (data > 1024 * 1024 * 1024) {
    return `${String(
      Math.floor((data / (1024 * 1024 * 1024)) * 100) / 100
    )} GiB`;
  }
  return "";
};

function Footer() {
  const [progress, setProgress] = useState(0);
  const [buffer, setBuffer] = useState(0);
  const [launcherState, setLauncherState] = useState("");
  const [gameState, setGameState] = useState("not_installed");
  const [gameLoading, setGameLoading] = useState(false);
  const [workspacePath, setWorkspacePath] = useState("");
  const [gameName, setGameName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [downloadedBytesStart, setDownloadedBytesStart] = useState("");
  const [downloadedBytesEnd, setDownloadedBytesEnd] = useState("");
  const [downloadedBytesPerSec, setDownloadedBytesPerSec] = useState("");
  const [appliedOutputBytesStart, setAppliedOutputBytesStart] = useState("");
  const [appliedOutputBytesEnd, setAppliedOutputBytesEnd] = useState("");
  const [appliedOutputBytesPerSec, setAppliedOutputBytesPerSec] = useState("");

  useEffect(() => {
    Load("workspace_path")
      .then((value) => setWorkspacePath(value))
      .catch(() => {});

    Load("game_url")
      .then((url: string) => setRepositoryUrl(url))
      .catch(() => {});

    Load("game")
      .then((game: string) => setGameName(game))
      .catch(() => {});

    listen<UpdateEvent>("sparus://downloadinfos", (event) => {
      setProgress(
        (event.payload.downloaded_bytes_start /
          event.payload.downloaded_bytes_end) *
          100
      );
      setBuffer(
        (event.payload.applied_output_bytes_start /
          event.payload.applied_output_bytes_end) *
          100
      );
      setDownloadedBytesStart(
        convert_readable_data(event.payload.downloaded_bytes_start)
      );
      setDownloadedBytesEnd(
        convert_readable_data(event.payload.downloaded_bytes_end)
      );
      setDownloadedBytesPerSec(
        convert_readable_data(event.payload.downloaded_bytes_per_sec)
      );
      setAppliedOutputBytesStart(
        convert_readable_data(event.payload.applied_output_bytes_start)
      );
      setAppliedOutputBytesEnd(
        convert_readable_data(event.payload.applied_output_bytes_end)
      );
      setAppliedOutputBytesPerSec(
        convert_readable_data(event.payload.applied_output_bytes_per_sec)
      );
    });
  });

  const spawn = async () => {
    let child;
    let extension;
    let shell;
    let arg: any;
    const platformName = await platform();
    switch (platformName) {
      case "win32":
        {
          extension = ".exe";
          shell = "cmd";
          arg = "/C";
        }
        break;
      case "darwin":
        {
          extension = ".app";
          shell = "sh";
          arg = "-c";
        }
        break;
      case "linux":
        {
          extension = ".sh";
          shell = "sh";
          arg = "-c";
        }
        break;
      default: {
        extension = "";
        shell = "";
        arg = "";
      }
    }

    const command = new Command(shell, [
      arg,
      workspacePath + gameName + extension,
    ]);

    command.on("close", (data) => {
      console.log(
        `command finished with code ${data.code} and signal ${data.signal}`
      );
    });

    command.on("error", (error) => console.log(`command error: "${error}"`));
    command.stdout.on("data", (line) =>
      console.log(`command stdout: "${line}"`)
    );
    command.stderr.on("data", (line) =>
      console.log(`command stderr: "${line}"`)
    );
    command
      .spawn()
      .then((c) => {
        child = c;
      })
      .catch((err) => console.log(err));
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexGrow: 1,
        alignItems: "flex-end",
        position: "fixed",
        bottom: "0%",
        width: "100%",
      }}
    >
      <Grid container spacing={2}>
        <Grid item xs={1} />
        <Grid item display="flex" justifyContent="flex-start" xs={10}>
          {gameLoading ? (
            <LinearProgress
              variant="determinate"
              value={buffer}
              valueBuffer={progress}
              sx={{
                height: 20,
                borderRadius: 5,
                width: "80%",
              }}
            />
          ) : null}
          {gameState === "not_installed" ? (
            <LoadingButton
              variant="contained"
              color="primary"
              loading={gameLoading}
              // loadingPosition="end"
              onClick={() => {
                setGameLoading(true);
                invoke("update_workspace", {
                  workspacePath,
                  repositoryUrl,
                })
                  .then(() => {
                    setGameState("installed");
                    setGameLoading(false);
                  })
                  .catch((error) => console.log(JSON.stringify(error)));
              }}
              sx={{
                position: "fixed",
                right: "130px",
                bottom: "70px",
              }}
            >
              Install
            </LoadingButton>
          ) : null}
        </Grid>
        <Grid item display="flex" justifyContent="flex-start" xs={6}>
          {gameState === "installing"
            ? `Download: ${downloadedBytesStart} / ${downloadedBytesEnd} @ ${downloadedBytesPerSec}/s Write : ${appliedOutputBytesStart} / ${appliedOutputBytesEnd} @ ${appliedOutputBytesPerSec}/s`
            : null}
        </Grid>
      </Grid>
    </Box>
  );
}

export default Footer;
