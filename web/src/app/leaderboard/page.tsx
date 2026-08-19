"use client";

import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import MilitaryTechIcon from "@mui/icons-material/MilitaryTech";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";

import { useGetLeaderboardQuery } from "@/features/alerts/api/knaqApi";
import type { Badge, LeaderboardPlayer } from "@/features/alerts/types";

const MEDALS = ["#FFD700", "#C0C0C0", "#CD7F32"]; // gold / silver / bronze

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function avatarColor(name: string) {
  const palette = ["#EFC01A", "#4B8189", "#d32f2f", "#0288d1", "#7b1fa2", "#2e7d32"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{ color: "primary.main", display: "flex" }}>{icon}</Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h4" fontWeight={700} lineHeight={1.1}>
            {value}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

function XpBar({ player }: { player: LeaderboardPlayer }) {
  const pct = Math.round((player.xpIntoLevel / player.xpForNextLevel) * 100);
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.25 }}>
        <Typography variant="caption" color="text.secondary">
          Lvl {player.level}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {player.xpIntoLevel}/{player.xpForNextLevel} XP
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{ height: 8, borderRadius: 4 }}
      />
    </Box>
  );
}

function PodiumCard({ player, place }: { player: LeaderboardPlayer; place: number }) {
  const theme = useTheme();
  const medal = MEDALS[place];
  const heights = [168, 140, 120];
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
      <Box sx={{ position: "relative", mb: 1 }}>
        <Avatar
          sx={{
            width: place === 0 ? 72 : 60,
            height: place === 0 ? 72 : 60,
            bgcolor: avatarColor(player.name),
            fontWeight: 700,
            fontSize: place === 0 ? 26 : 22,
            border: `3px solid ${medal}`,
          }}
        >
          {initials(player.name)}
        </Avatar>
        <MilitaryTechIcon
          sx={{
            position: "absolute",
            bottom: -6,
            right: -6,
            color: medal,
            fontSize: 28,
            filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.4))",
          }}
        />
      </Box>
      <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ maxWidth: 120 }}>
        {player.name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Lvl {player.level}
      </Typography>
      <Box
        sx={{
          mt: 1,
          width: "100%",
          maxWidth: 130,
          height: heights[place],
          borderRadius: "8px 8px 0 0",
          background: `linear-gradient(180deg, ${alpha(medal, 0.9)}, ${alpha(medal, 0.35)})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          pt: 1.5,
          color: theme.palette.getContrastText(medal),
        }}
      >
        <Typography variant="h4" fontWeight={800} lineHeight={1}>
          #{place + 1}
        </Typography>
        <Typography variant="h6" fontWeight={800} mt={0.5}>
          {player.points}
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.9 }}>
          XP
        </Typography>
      </Box>
    </Box>
  );
}

function BadgeChip({ badge, small }: { badge: Badge; small?: boolean }) {
  return (
    <Tooltip title={`${badge.description}${badge.earned ? "" : " (locked)"}`}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: small ? 0.5 : 1,
          py: small ? 0.25 : 0.75,
          borderRadius: 2,
          border: 1,
          borderColor: badge.earned ? "primary.main" : "divider",
          bgcolor: badge.earned ? "action.hover" : "transparent",
          opacity: badge.earned ? 1 : 0.45,
          filter: badge.earned ? "none" : "grayscale(1)",
        }}
      >
        <Box component="span" sx={{ fontSize: small ? 16 : 22, lineHeight: 1 }}>
          {badge.icon}
        </Box>
        {!small && (
          <Typography variant="caption" fontWeight={600}>
            {badge.label}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}

function StandingRow({ player, isMe }: { player: LeaderboardPlayer; isMe: boolean }) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: isMe ? "primary.main" : "divider",
        borderWidth: isMe ? 2 : 1,
        bgcolor: isMe ? "action.hover" : "background.paper",
      }}
    >
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={2} sm={1}>
            <Typography variant="h6" fontWeight={800} color="text.secondary" textAlign="center">
              {player.rank}
            </Typography>
          </Grid>
          <Grid item xs={10} sm={4}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Avatar sx={{ bgcolor: avatarColor(player.name), fontWeight: 700 }}>
                {initials(player.name)}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Typography variant="subtitle2" fontWeight={700} noWrap>
                    {player.name}
                  </Typography>
                  {isMe && <Chip label="YOU" size="small" color="primary" sx={{ height: 18 }} />}
                </Box>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {player.role}
                </Typography>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={7} sm={4}>
            <XpBar player={player} />
          </Grid>
          <Grid item xs={5} sm={3}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
              <Stack direction="row" spacing={0.5} sx={{ display: { xs: "none", sm: "flex" } }}>
                {player.badges
                  .filter((b) => b.earned)
                  .slice(0, 4)
                  .map((b) => (
                    <BadgeChip key={b.id} badge={b} small />
                  ))}
              </Stack>
              <Typography variant="h6" fontWeight={800} color="primary.main">
                {player.points}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

export default function LeaderboardPage() {
  const { data, isLoading } = useGetLeaderboardQuery();

  if (isLoading || !data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const { players, summary, meUserId } = data;
  const podium = players.slice(0, 3);
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean); // silver, gold, bronze
  const me = players.find((p) => p.userId === meUserId);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <EmojiEventsIcon sx={{ color: "primary.main", fontSize: 32 }} />
        <Typography variant="h5" fontWeight={800}>
          Arena
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {summary.company} — earn XP by triaging alerts. Acknowledge, assign, note, and resolve to
        climb the ranks and unlock achievements.
      </Typography>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={4}>
          <SummaryCard label="Total XP earned" value={summary.totalPoints} icon={<EmojiEventsIcon />} />
        </Grid>
        <Grid item xs={6} sm={4}>
          <SummaryCard
            label="Alerts resolved"
            value={summary.totalResolved}
            icon={<LocalFireDepartmentIcon />}
          />
        </Grid>
        <Grid item xs={6} sm={4}>
          <SummaryCard label="Active players" value={summary.activePlayers} icon={<PeopleAltIcon />} />
        </Grid>
      </Grid>

      {podiumOrder.length > 0 && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" mb={2}>
              Top performers
            </Typography>
            <Box sx={{ display: "flex", alignItems: "flex-end", gap: 2, justifyContent: "center" }}>
              {podiumOrder.map((p) => (
                <PodiumCard key={p.userId} player={p} place={p.rank - 1} />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      <Typography variant="subtitle2" mb={1.5}>
        Standings
      </Typography>
      <Stack spacing={1} mb={3}>
        {players.map((p) => (
          <StandingRow key={p.userId} player={p} isMe={p.userId === meUserId} />
        ))}
      </Stack>

      {me && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" mb={0.5}>
              Your achievements
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {me.badges.filter((b) => b.earned).length} of {me.badges.length} unlocked
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.5 }}>
              {me.badges.map((b) => (
                <BadgeChip key={b.id} badge={b} />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
