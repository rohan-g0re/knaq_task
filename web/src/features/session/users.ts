export interface DemoUser {
  name: string;
  role: string;
  company: string;
  token: string;
}

export const DEMO_USERS: DemoUser[] = [
  { name: "Alice Chen", role: "Facilities Manager", company: "Brookfield Properties", token: "brookfield-alice-token" },
  { name: "Bob Martinez", role: "Field Technician", company: "Brookfield Properties", token: "brookfield-bob-token" },
  { name: "Carol Davis", role: "Facilities Manager", company: "Hines", token: "hines-carol-token" },
  { name: "Dan Wright", role: "Field Technician", company: "Hines", token: "hines-dan-token" },
  { name: "Emi Tanaka", role: "Facilities Manager", company: "Mitsui Fudosan", token: "mitsui-emi-token" },
  { name: "Frank Liu", role: "Field Technician", company: "Mitsui Fudosan", token: "mitsui-frank-token" },
];
