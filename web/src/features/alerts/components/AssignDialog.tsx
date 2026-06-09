"use client";

import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import { useState } from "react";

import type { Alert } from "../types";
import { initials } from "./AssigneeCell";
import { useAssignMutation, useListUsersQuery } from "../api/knaqApi";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/lib/toast/ToastProvider";

interface Props {
  alert: Alert | null;
  open: boolean;
  onClose: () => void;
}

export default function AssignDialog({ alert, open, onClose }: Props) {
  const { data } = useListUsersQuery();
  const [assign, { isLoading }] = useAssignMutation();
  const { showSuccess, showError } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const users = (data?.data ?? []).filter((u) =>
    `${u.name} ${u.role}`.toLowerCase().includes(search.toLowerCase()),
  );
  const currentId = selected ?? alert?.assignedTo?.id ?? null;

  const handleClose = () => {
    setSearch("");
    setSelected(null);
    setNote("");
    onClose();
  };

  const handleAssign = async () => {
    if (!alert || currentId == null) return;
    try {
      await assign({ id: alert.id, assignee_id: currentId, note: note.trim() || undefined }).unwrap();
      showSuccess("Alert assigned.");
      handleClose();
    } catch (err) {
      showError(apiErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>Assign alert</DialogTitle>
      <DialogContent dividers>
        <TextField
          fullWidth
          size="small"
          placeholder="Search team members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 1 }}
        />
        <List dense>
          {users.map((u) => (
            <ListItemButton
              key={u.id}
              selected={currentId === u.id}
              onClick={() => setSelected(u.id)}
            >
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: "secondary.main" }}>{initials(u.name)}</Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={u.name}
                secondary={alert?.assignedTo?.id === u.id ? `${u.role} · current` : u.role}
              />
            </ListItemButton>
          ))}
        </List>
        <TextField
          fullWidth
          size="small"
          label="Reason for assignment (optional)"
          multiline
          minRows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" disabled={currentId == null || isLoading} onClick={handleAssign}>
          Assign
        </Button>
      </DialogActions>
    </Dialog>
  );
}
