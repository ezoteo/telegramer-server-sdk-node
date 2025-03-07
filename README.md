# Telegramer SDK

SDK для отправки аналитических событий и создания рассылок через сервер Telegramer.

## Использование

```typescript
import { TelegramerClient, composeMessage } from 'telegramer-server-sdk';

// Функция для отправки сообщений в Telegram
const sendTelegramMessage = async (payload) => {
  const { type, body } = composeMessage(payload);
  const telegramApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}`;
  
  const response = await fetch(`${telegramApiUrl}/${type}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
    
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(JSON.stringify(errorData));
  }
};

const client = new TelegramerClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.example.com',
  // Обязательный колбэк для отправки сообщений
  callbackHookSendMessage: sendTelegramMessage,
  // Опциональная функция для получения всех пользователей
  migrateUsersHook: async () => {
    // Получаем пользователей из базы данных
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
const broadcastResult = await client.broadcast({
  users: ['123456789', '987654321'],
  content: {
    type: 'message',
    text: 'Привет!',
    disable_notification: false,
    parse_mode: 'MarkdownV2',
    buttons: [
      { text: 'Открыть', url: 'https://example.com' }
    ]
  }
});

console.log(`Рассылка создана с ID: ${broadcastResult.broadcastId}`);

// Создание рассылки для всех пользователей (используя migrateUsersHook)
await client.broadcast({
  users: 'all',
  content: {
    type: 'message',
    text: 'Всем привет!',
    disable_notification: false,
    parse_mode: 'MarkdownV2'
  }
});

// Отслеживание состояния подключения
client.on('connected', () => {
  console.log('Подключение к RabbitMQ установлено');
});

client.on('disconnected', () => {
  console.log('Соединение с RabbitMQ разорвано, пытаемся переподключиться...');
});

// Отслеживание отправки сообщений
client.on('messageSent', (userId, success) => {
  if (success) {
    console.log(`Сообщение успешно отправлено пользователю ${userId}`);
  } else {
    console.log(`Ошибка при отправке сообщения пользователю ${userId}`);
  }
});

// Отслеживание ошибок
client.on('error', (error) => {
  console.error('Произошла ошибка:', error.message);
});

// Проверка состояния подключения
if (client.isConnected()) {
  console.log('Клиент подключен к RabbitMQ');
} else {
  console.log('Клиент не подключен к RabbitMQ');
}

// Закрытие соединения при завершении работы
await client.close();
```

## API

### Конструктор

```typescript
new TelegramerClient(config: {
  apiKey: string;
  baseUrl: string;
  callbackHookSendMessage: (payload: MessageQueueItem) => Promise<void>;
  migrateUsersHook?: () => Promise<{ tg: string | number }[]>;
})
```

> **Примечание**: 
> - Параметры подключения к RabbitMQ автоматически загружаются из API. SDK отправляет запрос на эндпоинт `/api/sdk/config` для получения строки подключения.
> - `callbackHookSendMessage` - обязательная функция для отправки сообщений в Telegram API. SDK предоставляет вспомогательную функцию `composeMessage` для формирования запросов.
> - При ошибке с кодом 429 (превышение лимита запросов) сообщение будет автоматически возвращено в очередь и будет пробовать отправляться до успешной доставки.

### Вспомогательные функции

#### composeMessage

Формирует данные для запроса к Telegram API на основе сообщения.

```typescript
composeMessage(messageData: MessageQueueItem): { endpoint: string; body: any }
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

Создает новую рассылку, отправляя сообщения в очередь RabbitMQ для последующей обработки и отправки через Telegram API.

```typescript
broadcast(options: {
  users: string[] | 'all';
  content: TelegramMessage;
}): Promise<{ broadcastId: string }>
```

#### isConnected

Проверяет, установлено ли соединение с RabbitMQ.

```typescript
isConnected(): boolean
```

#### close

Закрывает соединение с RabbitMQ при завершении работы с SDK.

```typescript
close(): Promise<void>
```

### События

#### connected

Событие вызывается при успешном подключении к RabbitMQ.

```typescript
on('connected', () => void)
```

#### disconnected

Событие вызывается при разрыве соединения с RabbitMQ.

```typescript
on('disconnected', () => void)
```

#### messageSent

Событие вызывается при отправке сообщения пользователю.

```typescript
on('messageSent', (userId: string, success: boolean) => void)
```

#### error

Событие вызывается при возникновении ошибки.

```typescript
on('error', (error: Error) => void)
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
