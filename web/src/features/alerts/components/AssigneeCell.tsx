"use client";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import type { UserBrief } from "../types";

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AssigneeCell({ user }: { user: UserBrief | null }) {
  if (!user) {
    return (
      <Typography variant="body2" color="text.secondary">
        Unassigned
      </Typography>
    );
  }
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Avatar sx={{ width: 28, height: 28, fontSize: 13, bgcolor: "secondary.main" }}>
        {initials(user.name)}
      </Avatar>
      <Typography variant="body2">{user.name}</Typography>
    </Box>
  );
}
