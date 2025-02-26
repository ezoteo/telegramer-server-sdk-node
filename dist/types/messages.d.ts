export interface Button {
    text: string;
    url?: string;
    callback_data?: string;
}
export interface MediaItem {
    type: 'audio' | 'document' | 'photo' | 'video';
    url: string;
    caption?: string;
}
export interface BaseMessage {
    disable_notification: boolean;
}
export interface MessageText extends BaseMessage {
    type: 'message';
    text: string;
    buttons?: Button[];
}
export interface MessageMediaGroup extends BaseMessage {
    type: 'mediaGroup';
    items: MediaItem[];
}
export interface MessagePhoto extends BaseMessage {
    type: 'photo';
    photo: string;
    caption?: string;
    buttons?: Button[];
}
export interface MessageVideoNote extends BaseMessage {
    type: 'videoNote';
    video_note: string;
    buttons?: Button[];
}
export interface MessageVoice extends BaseMessage {
    type: 'voice';
    voice: string;
    caption?: string;
    buttons?: Button[];
}
export interface MessagePoll extends BaseMessage {
    type: 'poll';
    question: string;
    options: string[];
    is_anonymous: boolean;
    allows_multiple_answers: boolean;
}
export type TelegramMessage = MessageText | MessageMediaGroup | MessagePhoto | MessageVideoNote | MessageVoice | MessagePoll;
