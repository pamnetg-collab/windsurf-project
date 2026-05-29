export interface Analytics {
  users: { total: number; active: number; trial: number; expired: number; banned: number };
  subscriptions: { active: number };
  payments: { count: number; revenue: number };
  referrals: { rewarded: number };
  conversion: number;
  servers: { count: number; totalCapacity: number; totalLoad: number; utilization: number };
}

export type ServerStatus = "active" | "warm" | "full" | "offline";

export interface Server {
  id: string;
  name: string;
  ip: string;
  port: number;
  region: string;
  capacity: number;
  currentUsers: number;
  status: ServerStatus;
  apiUrl: string | null;
  panelUser: string | null;
  inboundId: number | null;
  lastHealthAt: string | null;
}

export type UserStatus = "trial" | "active" | "expired" | "banned";

export interface AdminUser {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  status: UserStatus;
  referralCode: string;
  createdAt: string;
  subscriptions: { plan: string; endDate: string; status: string }[];
}

export interface UsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  pages: number;
}
