import { TelegramMessage } from './messages';
export interface UserData {
    tg: string | number;
}
export interface BroadcastOptions {
    users: string[] | 'all';
    content: TelegramMessage;
    timezone?: string;
    scheduledFor?: Date;
}
export interface BroadcastStatus {
    id: string;
    status: string;
    stats: {
        sent: number;
        errors: number;
        total: number;
        progress: number;
    };
    scheduledFor?: string;
    timezone?: string;
}
