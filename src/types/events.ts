export interface UserDetails {
  id?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isPremium?: boolean;
  writeAccess?: boolean;
}

export interface EventDetails {
  id?: string;
  startParameter: string;
  path: string;
  params: { [key: string]: unknown };
}

export interface Event {
  eventType: string;
  userDetails: UserDetails;
  eventDetails: EventDetails;
  telegramID: string;
  language: string;
  device: string;
  referrerType?: string;
  referrer?: string;
  timestamp?: Date;
  isAutocapture: boolean;
  wallet?: string;
  sessionIdentifier?: string;
  eventSource: string;
}

export interface TelegramerClientConfig {
  apiKey: string;
  baseUrl: string;
}
