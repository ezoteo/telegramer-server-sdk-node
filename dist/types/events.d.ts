import { UserData } from "./broadcast";
import { MessageQueueItem } from './broadcast';
export interface UserDetails {
    id: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    isPremium?: boolean;
}
export interface Event {
    startParameter: string;
    path: string;
    params: {
        [key: string]: unknown;
    };
    language?: string;
    device?: string;
}
export interface TelegramerClientConfig {
    apiKey: string;
    baseUrl?: string;
    migrateUsersHook?: () => Promise<UserData[]>;
    callbackHookSendMessage?: (payload: MessageQueueItem) => Promise<void>;
}
