"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useState } from "react";

import { useAddNoteMutation } from "../api/knaqApi";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/lib/toast/ToastProvider";

export default function AddNoteForm({ alertId }: { alertId: number }) {
  const [addNote, { isLoading }] = useAddNoteMutation();
  const { showSuccess, showError } = useToast();
  const [note, setNote] = useState("");

  const submit = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    try {
      await addNote({ id: alertId, note: trimmed }).unwrap();
      showSuccess("Note added.");
      setNote("");
    } catch (err) {
      showError(apiErrorMessage(err));
    }
  };

  return (
    <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Add a note to the timeline…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        multiline
        maxRows={4}
      />
      <Button variant="outlined" disabled={!note.trim() || isLoading} onClick={submit}>
        Add
      </Button>
    </Box>
  );
}
