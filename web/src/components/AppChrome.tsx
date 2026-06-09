"use client";

import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import SensorsIcon from "@mui/icons-material/Sensors";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Link from "next/link";

import { useColorMode } from "@/lib/theme/ColorModeProvider";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const { mode, toggle } = useColorMode();
  return (
    <>
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar>
          <SensorsIcon sx={{ color: "primary.main", mr: 1 }} />
          <Typography
            component={Link}
            href="/alerts"
            variant="h6"
            sx={{ fontWeight: 700, color: "text.primary", textDecoration: "none", flexGrow: 1 }}
          >
            Knaq
            <Typography component="span" sx={{ color: "text.secondary", ml: 1, fontWeight: 400 }}>
              Alert Triage
            </Typography>
          </Typography>
          <Tooltip title="Signed in as Alice Chen · Brookfield Properties">
            <Typography variant="body2" sx={{ color: "text.secondary", mr: 1 }}>
              Alice Chen
            </Typography>
          </Tooltip>
          <Tooltip title={mode === "light" ? "Switch to dark mode" : "Switch to light mode"}>
            <IconButton onClick={toggle} color="inherit" aria-label="toggle color mode">
              {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Box>{children}</Box>
      </Container>
    </>
  );
}
