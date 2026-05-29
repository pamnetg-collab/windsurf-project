export interface SubStatus {
  active: boolean;
  plan: string | null;
  endDate: string | null;
  daysLeft: number;
}

export interface Plan {
  plan: "m1" | "m3";
  title: string;
  description: string;
  amount: number;
  currency: string;
}

export interface ServerItem {
  id: string;
  name: string;
  region: string;
  load: number;
  status: string;
}

export interface ReferralInfo {
  code: string;
  link: string;
}

export interface ReferralStats {
  invited: number;
  rewarded: number;
  pending: number;
  daysEarned: number;
}

export interface AccessConfig {
  config: string;
  server: { id: string; name: string; region: string };
}
