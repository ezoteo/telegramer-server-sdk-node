import { TelegramMessage } from './messages';
export interface UserData {
    tg: string | number;
}
export interface BroadcastOptions {
    users: string[] | 'all';
    content: TelegramMessage;
}
export interface MessageQueueItem {
    userId: string;
    message: TelegramMessage;
}
