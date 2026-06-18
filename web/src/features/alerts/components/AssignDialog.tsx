"use client";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/lib/toast/ToastProvider";
import { useAssignMutation, useBulkAssignMutation, useListUsersQuery } from "../api/knaqApi";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase();
}

interface Props {
  ids: number[];
  onClose: () => void;
}

export default function AssignDialog({ ids, onClose }: Props) {
  const { data } = useListUsersQuery();
  const [assign] = useAssignMutation();
  const [bulkAssign] = useBulkAssignMutation();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");

  const users = (data?.data ?? []).filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.role ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleSubmit() {
    if (!selectedId) return;
    try {
      if (ids.length === 1) {
        await assign({ id: ids[0], assigneeId: selectedId, note: note || undefined }).unwrap();
      } else {
        await bulkAssign({ ids, assigneeId: selectedId, note: note || undefined }).unwrap();
      }
      toast("Assigned successfully", "success");
      onClose();
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Assign Alert{ids.length > 1 ? `s (${ids.length})` : ""}</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          size="small"
          placeholder="Search by name or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 1 }}
        />
        <List dense disablePadding>
          {users.map((u) => (
            <ListItemButton
              key={u.id}
              selected={selectedId === u.id}
              onClick={() => setSelectedId(u.id)}
            >
              <ListItemAvatar>
                <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: "secondary.main" }}>
                  {initials(u.name)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText primary={u.name} secondary={u.role} />
            </ListItemButton>
          ))}
          {users.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
              No users found.
            </Typography>
          )}
        </List>
        <TextField
          fullWidth
          size="small"
          label="Reason (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!selectedId} onClick={handleSubmit}>
          Assign
        </Button>
      </DialogActions>
    </Dialog>
  );
}
