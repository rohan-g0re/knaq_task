"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useFormik } from "formik";
import * as Yup from "yup";

import type { ResolutionType } from "../types";
import { useResolveMutation } from "../api/knaqApi";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/lib/toast/ToastProvider";

const RESOLUTION_TYPES: { value: ResolutionType; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "false_alarm", label: "False Alarm" },
  { value: "known_issue", label: "Known Issue" },
  { value: "deferred", label: "Deferred" },
  { value: "cannot_reproduce", label: "Cannot Reproduce" },
];

const schema = Yup.object({
  resolution_type: Yup.string().required("Resolution type is required"),
  root_cause: Yup.string().trim().required("Root cause is required"),
  action_taken: Yup.string().trim().required("Action taken is required"),
  preventive_measures: Yup.string(),
  time_spent_minutes: Yup.number().min(0, "Must be ≥ 0").nullable(),
});

interface Props {
  alertId: number;
  open: boolean;
  onClose: () => void;
}

export default function ResolveDialog({ alertId, open, onClose }: Props) {
  const [resolve, { isLoading }] = useResolveMutation();
  const { showSuccess, showError } = useToast();

  const formik = useFormik({
    initialValues: {
      resolution_type: "" as ResolutionType | "",
      root_cause: "",
      action_taken: "",
      preventive_measures: "",
      time_spent_minutes: "",
    },
    validationSchema: schema,
    onSubmit: async (values, { resetForm }) => {
      try {
        await resolve({
          id: alertId,
          resolution_type: values.resolution_type as ResolutionType,
          root_cause: values.root_cause.trim(),
          action_taken: values.action_taken.trim(),
          preventive_measures: values.preventive_measures.trim() || undefined,
          time_spent_minutes: values.time_spent_minutes ? Number(values.time_spent_minutes) : undefined,
        }).unwrap();
        showSuccess("Alert resolved.");
        resetForm();
        onClose();
      } catch (err) {
        showError(apiErrorMessage(err));
      }
    },
  });

  const field = (name: keyof typeof formik.values) => ({
    name,
    value: formik.values[name],
    onChange: formik.handleChange,
    onBlur: formik.handleBlur,
    error: formik.touched[name] && Boolean(formik.errors[name]),
    helperText: formik.touched[name] ? (formik.errors[name] as string | undefined) : undefined,
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={formik.handleSubmit} noValidate>
        <DialogTitle>Resolve alert</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField select label="Resolution type" required {...field("resolution_type")}>
              {RESOLUTION_TYPES.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Root cause" required {...field("root_cause")} />
            <TextField label="Action taken" required multiline minRows={2} {...field("action_taken")} />
            <TextField label="Preventive measures" multiline minRows={2} {...field("preventive_measures")} />
            <TextField label="Time spent (minutes)" type="number" {...field("time_spent_minutes")} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!formik.isValid || !formik.dirty || isLoading}>
            Resolve
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
