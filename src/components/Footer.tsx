import { useState, useEffect, useContext } from "react";
import LinearProgress from "@mui/material/LinearProgress";
import LoadingButton from "@mui/lab/LoadingButton";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import AppBar from "@mui/material/AppBar";

// Icons
import ChatIcon from "@mui/icons-material/Chat";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import HomeIcon from "@mui/icons-material/Home";

// Context
import SparusErrorContext from "utils/Context";

// Tauri api
import { invoke } from "@tauri-apps/api/core";
import { appConfigDir } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";
import { Command } from "@tauri-apps/plugin-shell";
import { platform } from "@tauri-apps/plugin-os";
import { Store } from "tauri-plugin-store-api";

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
  const [currentTab, setCurrentTab] = useState(0);
  const [progress, setProgress] = useState(0);
  const [buffer, setBuffer] = useState(0);
  const [gameState, setGameState] = useState("not_installed");
  const [gameLoading, setGameLoading] = useState(false);
  const [workspacePath, setWorkspacePath] = useState<string>("");
  const [gameName, setGameName] = useState<string>("");
  const [repositoryUrl, setRepositoryUrl] = useState<string>("");
  const [downloadedBytesStart, setDownloadedBytesStart] = useState("");
  const [downloadedBytesEnd, setDownloadedBytesEnd] = useState("");
  const [downloadedBytesPerSec, setDownloadedBytesPerSec] = useState("");
  const [appliedOutputBytesStart, setAppliedOutputBytesStart] = useState("");
  const [appliedOutputBytesEnd, setAppliedOutputBytesEnd] = useState("");
  const [appliedOutputBytesPerSec, setAppliedOutputBytesPerSec] = useState("");
  const [localConfig, setLocalConfig] = useState<string>("");

  const { setGlobalError } = useContext(SparusErrorContext);

  /*  appConfigDir()
    .then((dir) => setLocalConfig(dir))
    .catch((err: string) => setGlobalError(err));
  const store = new Store(`${localConfig}.settings.sparus`);
/*
  /* useEffect(() => {
    store.load().catch((err: string) => setGlobalError(err));
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
      })
      .catch((err: string) => setGlobalError(err));

    store
      .get<string>("game_name")
      .then((value) => {
        if (value) setGameName(value);
      })
      .catch((err: string) => setGlobalError(err));

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
  }); */

  const spawn = () => {
    let extension;
    let shell: string;
    let arg: string;

    switch (platform()) {
      case "windows":
        extension = ".exe";
        shell = "cmd";
        arg = "/C";
        break;
      case "macos":
        extension = ".app";
        shell = "sh";
        arg = "-c";
        break;
      case "linux":
        extension = ".sh";
        shell = "sh";
        arg = "-c";
        break;
      default:
        extension = "";
        shell = "";
        arg = "";
        break;
    }

    Command.create(shell, [arg, workspacePath + gameName + extension])
      .execute()
      .catch((err: string) => setGlobalError(err));
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
      <Grid container spacing={2} sx={{ display: { xl: "block", xs: "none" } }}>
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
                  .catch((err: string) => setGlobalError(err));
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
          {gameState === "installed" ? (
            <LoadingButton
              variant="contained"
              color="primary"
              onClick={() => spawn()}
              sx={{
                position: "fixed",
                right: "130px",
                bottom: "70px",
              }}
            >
              Play
            </LoadingButton>
          ) : null}
        </Grid>
        <Grid item display="flex" justifyContent="flex-start" xs={6}>
          {gameState === "installing"
            ? `Download: ${downloadedBytesStart} / ${downloadedBytesEnd} @ ${downloadedBytesPerSec}/s Write : ${appliedOutputBytesStart} / ${appliedOutputBytesEnd} @ ${appliedOutputBytesPerSec}/s`
            : null}
        </Grid>
      </Grid>
      <Box
        sx={{
          display: { xl: "none", xs: "block" },
          cbgcolor: "background.paper",
          width: window.innerWidth,
        }}
      >
        <AppBar position="static">
          <Tabs
            indicatorColor="secondary"
            textColor="inherit"
            variant="fullWidth"
            value={currentTab}
            onChange={(_, t) => setCurrentTab(t)}
            aria-label="menu tab"
          >
            <Tab icon={<HomeIcon fontSize="large" />} aria-label="home" />
            <Tab icon={<ChatIcon fontSize="large" />} aria-label="chat" />
            <Tab
              icon={<AccountCircleIcon fontSize="large" />}
              aria-label="account"
            />
          </Tabs>
        </AppBar>
      </Box>
    </Box>
  );
}

export default Footer;
