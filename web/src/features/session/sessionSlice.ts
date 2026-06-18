import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { DEMO_USERS } from "./users";

function resolveInitialToken(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("knaq.activeToken");
    if (stored) return stored;
  }
  return process.env.NEXT_PUBLIC_API_TOKEN ?? "";
}

function resolveInitialUser() {
  const token = resolveInitialToken();
  return DEMO_USERS.find((u) => u.token === token) ?? DEMO_USERS[0];
}

interface SessionState {
  token: string;
  userName: string;
  company: string;
}

const initial = resolveInitialUser();
const initialState: SessionState = {
  token: resolveInitialToken(),
  userName: initial.name,
  company: initial.company,
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setToken(state, action: PayloadAction<{ token: string; userName: string; company: string }>) {
      state.token = action.payload.token;
      state.userName = action.payload.userName;
      state.company = action.payload.company;
      if (typeof window !== "undefined") {
        localStorage.setItem("knaq.activeToken", action.payload.token);
      }
    },
  },
});

export const { setToken } = sessionSlice.actions;
export default sessionSlice.reducer;
