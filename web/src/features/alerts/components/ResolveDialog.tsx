"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import { useFormik } from "formik";
import * as Yup from "yup";

import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/lib/toast/ToastProvider";
import { useResolveMutation } from "../api/knaqApi";

const RESOLUTION_TYPES = [
  { value: "fixed", label: "Fixed" },
  { value: "false_alarm", label: "False Alarm" },
  { value: "known_issue", label: "Known Issue" },
  { value: "deferred", label: "Deferred" },
  { value: "cannot_reproduce", label: "Cannot Reproduce" },
];

const schema = Yup.object({
  resolution_type: Yup.string().required("Required"),
  root_cause: Yup.string().min(1).required("Required"),
  action_taken: Yup.string().min(1).required("Required"),
  preventive_measures: Yup.string(),
  time_spent_minutes: Yup.number().min(0).nullable(),
});

interface Props {
  alertId: number;
  onClose: () => void;
}

export default function ResolveDialog({ alertId, onClose }: Props) {
  const [resolve] = useResolveMutation();
  const { toast } = useToast();

  const formik = useFormik({
    initialValues: {
      resolution_type: "",
      root_cause: "",
      action_taken: "",
      preventive_measures: "",
      time_spent_minutes: "",
    },
    validationSchema: schema,
    onSubmit: async (values) => {
      try {
        await resolve({
          id: alertId,
          body: {
            ...values,
            time_spent_minutes: values.time_spent_minutes ? Number(values.time_spent_minutes) : null,
          },
        }).unwrap();
        toast("Alert resolved", "success");
        onClose();
      } catch (e) {
        toast(apiErrorMessage(e), "error");
      }
    },
  });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Resolve Alert</DialogTitle>
      <form onSubmit={formik.handleSubmit}>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <FormControl
            fullWidth
            size="small"
            error={formik.touched.resolution_type && Boolean(formik.errors.resolution_type)}
          >
            <InputLabel>Resolution type *</InputLabel>
            <Select
              name="resolution_type"
              label="Resolution type *"
              value={formik.values.resolution_type}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
            >
              {RESOLUTION_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </Select>
            {formik.touched.resolution_type && formik.errors.resolution_type && (
              <FormHelperText>{formik.errors.resolution_type}</FormHelperText>
            )}
          </FormControl>

          <TextField
            fullWidth
            size="small"
            name="root_cause"
            label="Root cause *"
            value={formik.values.root_cause}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.root_cause && Boolean(formik.errors.root_cause)}
            helperText={formik.touched.root_cause && formik.errors.root_cause}
          />

          <TextField
            fullWidth
            size="small"
            multiline
            rows={3}
            name="action_taken"
            label="Action taken *"
            value={formik.values.action_taken}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.action_taken && Boolean(formik.errors.action_taken)}
            helperText={formik.touched.action_taken && formik.errors.action_taken}
          />

          <TextField
            fullWidth
            size="small"
            name="preventive_measures"
            label="Preventive measures (optional)"
            value={formik.values.preventive_measures}
            onChange={formik.handleChange}
          />

          <TextField
            fullWidth
            size="small"
            type="number"
            name="time_spent_minutes"
            label="Time spent (minutes, optional)"
            value={formik.values.time_spent_minutes}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            inputProps={{ min: 0 }}
            error={formik.touched.time_spent_minutes && Boolean(formik.errors.time_spent_minutes)}
            helperText={formik.touched.time_spent_minutes && formik.errors.time_spent_minutes}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!formik.isValid || !formik.dirty || formik.isSubmitting}
          >
            Resolve
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
