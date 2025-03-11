import { UserData } from "./broadcast";
import { MessageQueueItem } from './broadcast';
export interface UserDetails {
    id: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    isPremium?: boolean;
}
export interface EventDetails {
    id?: string;
    startParameter: string;
    path: string;
    params: {
        [key: string]: unknown;
    };
}
export interface Event {
    eventType: string;
    eventDetails: EventDetails;
    telegramId: string;
    language: string;
    device: string;
    timestamp?: Date;
}
export interface TelegramerClientConfig {
    apiKey: string;
    baseUrl?: string;
    migrateUsersHook?: () => Promise<UserData[]>;
    callbackHookSendMessage?: (payload: MessageQueueItem) => Promise<void>;
}
