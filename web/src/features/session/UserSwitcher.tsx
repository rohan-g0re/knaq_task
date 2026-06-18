"use client";

import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch, RootState } from "@/lib/store";
import { knaqApi } from "@/features/alerts/api/knaqApi";
import { clearFilters } from "@/features/alerts/slices/filtersSlice";
import { setToken } from "./sessionSlice";
import { DEMO_USERS } from "./users";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase();
}

const COMPANIES = [...new Set(DEMO_USERS.map((u) => u.company))];

export default function UserSwitcher() {
  const dispatch = useDispatch<AppDispatch>();
  const activeToken = useSelector((s: RootState) => s.session.token);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const activeUser =
    DEMO_USERS.find((u) => u.token === activeToken) ??
    DEMO_USERS.find((u) => u.token === process.env.NEXT_PUBLIC_API_TOKEN) ??
    DEMO_USERS[0];

  const displayUser = mounted ? activeUser : DEMO_USERS[0];

  function switchUser(user: typeof DEMO_USERS[0]) {
    dispatch(setToken({ token: user.token, userName: user.name, company: user.company }));
    dispatch(knaqApi.util.resetApiState());
    dispatch(clearFilters());
    setAnchor(null);
  }

  return (
    <>
      <Chip
        icon={<AccountCircleIcon />}
        label={displayUser.name}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ mr: 1, cursor: "pointer" }}
        variant="outlined"
      />
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {COMPANIES.map((company, ci) => {
          const users = DEMO_USERS.filter((u) => u.company === company);
          return (
            <Box key={company}>
              {ci > 0 && <Divider />}
              <Typography variant="caption" sx={{ px: 2, py: 0.5, display: "block", color: "text.secondary" }}>
                {company}
              </Typography>
              {users.map((user) => (
                <MenuItem
                  key={user.token}
                  selected={user.token === activeToken}
                  onClick={() => switchUser(user)}
                >
                  <Avatar sx={{ width: 28, height: 28, fontSize: 12, mr: 1, bgcolor: "primary.main", color: "text.primary" }}>
                    {initials(user.name)}
                  </Avatar>
                  <ListItemText primary={user.name} secondary={user.role} />
                </MenuItem>
              ))}
            </Box>
          );
        })}
      </Menu>
    </>
  );
}
