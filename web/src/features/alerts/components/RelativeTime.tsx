"use client";

import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import dayjs from "@/lib/dayjs";

// Relative "now" against true UTC timestamps (data is Feb 2026 -> reads "x months ago"),
// with the exact device-local time on a tooltip. We never fudge time in the client.
export default function RelativeTime({ iso, tz }: { iso: string; tz: string }) {
  const local = dayjs.utc(iso).tz(tz);
  return (
    <Tooltip title={`${local.format("MMM D, YYYY HH:mm")} (${tz})`}>
      <Typography variant="body2" component="span" sx={{ cursor: "help" }}>
        {dayjs.utc(iso).fromNow()}
      </Typography>
    </Tooltip>
  );
}
