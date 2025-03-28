import { useState } from "react";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import AppBar from "@mui/material/AppBar";
import MobileBackground from "assets/MobileBackground.jpg";

// Icons
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import HomeIcon from "@mui/icons-material/Home";

function HomePanel({ value, index }: { value: number; index: number }) {
  return value === index ? (
    <Grid
      sx={{
        display: {
          sm: "none",
          xs: "block",
        },
        height: "93%",
        width: "100vw",
        backgroundSize: "cover",
        backgroundImage: `url(${MobileBackground})`,
      }}
    />
  ) : null;
}

function MobileIndex() {
  const [currentTab, setCurrentTab] = useState(0);

  return (
    <>
      <HomePanel value={currentTab} index={0} />
      <AppBar
        position="fixed"
        sx={{
          top: "auto",
          bottom: 0,
          display: {
            sm: "none",
            xs: "block",
          },
        }}
      >
        <Tabs
          indicatorColor="secondary"
          textColor="inherit"
          variant="fullWidth"
          value={currentTab}
          aria-label="menu tab"
          onChange={(_, tab: number) => {
            setCurrentTab(tab);
          }}
        >
          <Tab icon={<HomeIcon fontSize="large" />} aria-label="home" />
          <Tab
            icon={<AccountCircleIcon fontSize="large" />}
            aria-label="account"
          />
        </Tabs>
      </AppBar>
    </>
  );
}

export default MobileIndex;
