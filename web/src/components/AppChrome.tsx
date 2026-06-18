"use client";

import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import SensorsIcon from "@mui/icons-material/Sensors";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { usePathname } from "next/navigation";

import UserSwitcher from "@/features/session/UserSwitcher";
import { useColorMode } from "@/lib/theme/ColorModeProvider";

const NAV = [
  { href: "/alerts", label: "Queue" },
  { href: "/analytics", label: "Analytics" },
];

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const { mode, toggle } = useColorMode();
  const pathname = usePathname();
  return (
    <>
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar>
          <SensorsIcon sx={{ color: "primary.main", mr: 1 }} />
          <Typography
            component={Link}
            href="/alerts"
            variant="h6"
            sx={{ fontWeight: 700, color: "text.primary", textDecoration: "none" }}
          >
            Knaq
            <Typography component="span" sx={{ color: "text.secondary", ml: 1, fontWeight: 400 }}>
              Alert Triage
            </Typography>
          </Typography>
          <Box sx={{ display: "flex", gap: 0.5, ml: 3, flexGrow: 1 }}>
            {NAV.map(({ href, label }) => {
              const active = pathname === href || (href === "/alerts" && pathname?.startsWith("/alerts"));
              return (
                <Button
                  key={href}
                  component={Link}
                  href={href}
                  size="small"
                  sx={{
                    color: active ? "text.primary" : "text.secondary",
                    fontWeight: active ? 700 : 500,
                    borderBottom: 2,
                    borderColor: active ? "primary.main" : "transparent",
                    borderRadius: 0,
                  }}
                >
                  {label}
                </Button>
              );
            })}
          </Box>
          <UserSwitcher />
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
