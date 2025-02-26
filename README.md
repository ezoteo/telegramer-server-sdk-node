# Telegramer SDK

SDK для отправки аналитических событий и создания рассылок через сервер Telegramer.

## Использование

```typescript
import { TelegramerClient } from 'telegramer-server-sdk';

const client = new TelegramerClient({
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  baseUrl: 'https://api.example.com',
  // Опциональная функция для получения всех пользователей
  migrateUsersHook: async () => {
    // Получаем пользователей из вашей базы данных
    return [
      { tg: '123456789' },
      { tg: '987654321' }
    ];
  }
});

// Отправка аналитического события
await client.track({
  eventType: 'button_click',
  userDetails: {
    id: '123456789'
  },
  eventDetails: {
    startParameter: '',
    path: '/start',
    params: {
      buttonId: 'start'
    }
  },
  telegramID: '123456789',
  language: 'en',
  device: 'mobile',
  isAutocapture: false,
  eventSource: 'sdk'
});

// Создание рассылки для конкретных пользователей
await client.broadcast({
  users: ['123456789', '987654321'],
  content: {
    type: 'message',
    text: 'Привет!',
    disable_notification: false,
    buttons: [
      { text: 'Открыть', url: 'https://example.com' }
    ]
  }
});

// Создание рассылки для всех пользователей (используя migrateUsersHook)
await client.broadcast({
  users: 'all',
  content: {
    type: 'message',
    text: 'Всем привет!',
    disable_notification: false
  }
});

// Отслеживание завершения рассылок
client.on('endBroadcast', (status) => {
  if (status.status === 'completed') {
    console.log(`Рассылка ${status.id} завершена`);
    console.log(`Отправлено: ${status.stats.sent}`);
    console.log(`Ошибок: ${status.stats.errors}`);
    console.log(`Всего: ${status.stats.total}`);
    console.log(`Прогресс: ${status.stats.progress}%`);
  }
});
```

## API

### Конструктор

```typescript
new TelegramerClient(config: {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  migrateUsersHook?: () => Promise<{ tg: string | number }[]>;
})
```

### Методы

#### track

Отправляет аналитическое событие на сервер.

```typescript
track(event: Event): Promise<void>

interface UserDetails {
  id?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isPremium?: boolean;
  writeAccess?: boolean;
}

interface EventDetails {
  id?: string;
  startParameter: string;
  path: string;
  params: { [key: string]: unknown };
}

interface Event {
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
```

#### broadcast

Создает новую рассылку.

```typescript
broadcast(options: {
  users: string[] | 'all';
  content: TelegramMessage;
  timezone?: string;
  scheduledFor?: Date;
}): Promise<{ success: boolean; broadcastId: string }>
```

### События

#### endBroadcast

Событие вызывается при завершении рассылки.

```typescript
on('endBroadcast', (status: {
  id: string;
  status: 'pending' | 'scheduled' | 'sending' | 'completed' | 'failed';
  stats: {
    sent: number;
    errors: number;
    total: number;
    progress: number;
  };
  scheduledFor?: string;
  timezone?: string;
}) => void)
```

### Типы сообщений

#### TelegramMessage

```typescript
// Базовые типы
interface Button {
  text: string;
  url?: string;
  callback_data?: string;
}

interface MediaItem {
  type: 'audio' | 'document' | 'photo' | 'video';
  url: string;
  caption?: string;
}

interface BaseMessage {
  disable_notification: boolean;
}

// Типы сообщений
type TelegramMessage =
  | MessageText
  | MessageMediaGroup
  | MessagePhoto
  | MessageVideoNote
  | MessageVoice
  | MessagePoll;

interface MessageText extends BaseMessage {
  type: 'message';
  text: string;
  buttons?: Button[];
}

interface MessageMediaGroup extends BaseMessage {
  type: 'mediaGroup';
  items: MediaItem[];
}

interface MessagePhoto extends BaseMessage {
  type: 'photo';
  photo: string;
  caption?: string;
  buttons?: Button[];
}

interface MessageVideoNote extends BaseMessage {
  type: 'videoNote';
  video_note: string;
  buttons?: Button[];
}

interface MessageVoice extends BaseMessage {
  type: 'voice';
  voice: string;
  caption?: string;
  buttons?: Button[];
}

interface MessagePoll extends BaseMessage {
  type: 'poll';
  question: string;
  options: string[];
  is_anonymous: boolean;
  allows_multiple_answers: boolean;
}
```

## Примеры

### Отправка текстового сообщения с кнопками

```typescript
await client.broadcast({
  users: ['123456789'],
  content: {
    type: 'message',
    text: 'Привет! Посетите наш сайт:',
    disable_notification: false,
    buttons: [
      { text: 'Открыть сайт', url: 'https://example.com' },
      { text: 'Документация', url: 'https://docs.example.com' }
    ]
  }
});
```

### Отправка фото

```typescript
await client.broadcast({
  users: ['123456789'],
  content: {
    type: 'photo',
    photo: 'https://example.com/image.jpg',
    caption: 'Красивое фото!',
    disable_notification: false,
    buttons: [
      { text: 'Подробнее', url: 'https://example.com/about-photo' }
    ]
  }
});
```

### Отправка группы медиа

```typescript
await client.broadcast({
  users: ['123456789'],
  content: {
    type: 'mediaGroup',
    disable_notification: false,
    items: [
      {
        type: 'photo',
        url: 'https://example.com/image1.jpg',
        caption: 'Первое фото'
      },
      {
        type: 'video',
        url: 'https://example.com/video1.mp4',
        caption: 'Видео к фотографии'
      }
    ]
  }
});
```

### Создание опроса

```typescript
await client.broadcast({
  users: ['123456789'],
  content: {
    type: 'poll',
    disable_notification: false,
    question: 'Какой язык программирования вы предпочитаете?',
    options: ['JavaScript', 'Python', 'Java', 'C++'],
    is_anonymous: true,
    allows_multiple_answers: false
  }
});
```

### Отложенная рассылка голосового сообщения

```typescript
await client.broadcast({
  users: 'all',
  content: {
    type: 'voice',
    voice: 'https://example.com/voice.ogg',
    caption: 'Важное голосовое сообщение!',
    disable_notification: true
  },
  timezone: 'Europe/Moscow',
  scheduledFor: new Date('2025-03-01T10:00:00')
});
