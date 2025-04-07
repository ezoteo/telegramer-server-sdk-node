import { Event, TelesendClientConfig, UserDetails } from './types/events';
import { BroadcastOptions, MessageQueueItem } from './types/broadcast';
import { EventEmitter } from 'events';
import * as amqp from 'amqplib';
import { ApiConfigResponse } from './types/api';

/**
 * Формирует сообщение для отправки в Telegram API
 * @param messageData Данные сообщения
 * @returns Подготовленные тип и тело запроса
 */
export function composeMessage(messageData: MessageQueueItem): { type: string; body: any } {
  const { userId, message } = messageData;
  let type = '';
  let body: any = {};

  switch (message.type) {
    case 'message':
      type = 'sendMessage';
      body = {
        chat_id: userId,
        text: message.text,
        parse_mode: message.parse_mode,
        disable_notification: message.disable_notification
      };

      if (message.buttons && message.buttons.length > 0) {
        body.reply_markup = {
          inline_keyboard: [message.buttons.map(button => ({
            text: button.text,
            ...(button.url ? { url: button.url } : {}),
            ...(button.callback_data ? { callback_data: button.callback_data } : {})
          }))]
        };
      }
      break;

    case 'photo':
      type = 'sendPhoto';
      body = {
        chat_id: userId,
        photo: message.photo,
        caption: message.caption,
        parse_mode: message.parse_mode,
        disable_notification: message.disable_notification
      };

      if (message.buttons && message.buttons.length > 0) {
        body.reply_markup = {
          inline_keyboard: [message.buttons.map(button => ({
            text: button.text,
            ...(button.url ? { url: button.url } : {}),
            ...(button.callback_data ? { callback_data: button.callback_data } : {})
          }))]
        };
      }
      break;

    case 'videoNote':
      type = 'sendVideoNote';
      body = {
        chat_id: userId,
        video_note: message.video_note,
        disable_notification: message.disable_notification
      };
      break;

    case 'voice':
      type = 'sendVoice';
      body = {
        chat_id: userId,
        voice: message.voice,
        caption: message.caption,
        parse_mode: message.parse_mode,
        disable_notification: message.disable_notification
      };
      break;

    case 'poll':
      type = 'sendPoll';
      body = {
        chat_id: userId,
        question: message.question,
        options: message.options,
        is_anonymous: message.is_anonymous,
        allows_multiple_answers: message.allows_multiple_answers,
        disable_notification: message.disable_notification
      };
      break;

    case 'mediaGroup':
      type = 'sendMediaGroup';
      const media = message.items.map(item => ({
        type: item.type,
        media: item.url,
        ...(item.caption ? { caption: item.caption } : {})
      }));

      body = {
        chat_id: userId,
        media,
        disable_notification: message.disable_notification
      };
      break;

    default:
      throw new Error(`Unsupported message type: ${(message as any).type}`);
  }

  return { type, body };
}

export declare interface TelesendClient {
  on(event: 'messageSent', listener: (userId: string, success: boolean) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
}

export class TelesendClient extends EventEmitter {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly migrateUsersHook?: TelesendClientConfig['migrateUsersHook'];
  private readonly activeBroadcasts: Set<string> = new Set();
  private readonly callbackHookSendMessage?: TelesendClientConfig['callbackHookSendMessage'];

  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private readonly QUEUE_PREFIX = "broadcast_";
  private readonly BATCH_SIZE = 20; // Packet size
  private readonly BATCH_INTERVAL = 1000; // One second interval
  private processingMessages = false;
  private consumerTag?: string;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private reconnectTimeout?: NodeJS.Timeout;
  private processIncompleteInterval?: NodeJS.Timeout;
  private checkQueueInterval?: NodeJS.Timeout;
  private lastBatchTime = 0;
  private isConnecting = false;
  private connectionUrl = '';

  /**
   * Создает новый экземпляр клиента Telesend
   * @param config Конфигурация клиента
   * @param config.apiKey API ключ проекта
   * @param config.baseUrl Базовый URL API
   * @param config.migrateUsersHook Опциональная функция для получения всех пользователей
   * @param config.callbackHookSendMessage Функция для отправки сообщений
   */
  constructor(config: TelesendClientConfig) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.telesend.io';
    this.migrateUsersHook = config.migrateUsersHook;
    this.callbackHookSendMessage = config.callbackHookSendMessage;

    this.setupConfig().catch(error => {
      this.emit('error', new Error(`Failed to setup config: ${error.message}`));
    });
  }

  /**
   * Получает конфигурацию из API и устанавливает параметры подключения
   * @private
   */
  private async setupConfig(): Promise<void> {
    const maxRetries = 3;
    let retries = 0;
    let success = false;

    while (retries < maxRetries && !success) {
      try {
        if (retries > 0) {
          this.emit('info', `Getting config attempt: ${retries + 1} of ${maxRetries}`);
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        const config: ApiConfigResponse = await this.makeRequest('/api/sdk/config', 'GET');

        if (config.rabbitmq && config.rabbitmq.url) {
          this.connectionUrl = config.rabbitmq.url;
        } else {
          this.connectionUrl = 'amqp://localhost';
        }

        success = true;
        await this.connectToRabbitMQ();
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          this.connectionUrl = 'amqp://localhost';
          this.emit('error', new Error(`Failed to get config from API after ${maxRetries} attempts: ${(error as Error).message}. Using default connection.`));
          await this.connectToRabbitMQ();
        } else {
          this.emit('warn', `Error getting config (attempt ${retries} of ${maxRetries}): ${(error as Error).message}. Retrying in 5 seconds.`);
        }
      }
    }
  }

  /**
   * Устанавливает соединение с RabbitMQ
   * @private
   */
  private async connectToRabbitMQ(): Promise<void> {
    if (this.isConnecting) return;

    this.isConnecting = true;

    try {
      this.connection = await amqp.connect(this.connectionUrl);
      this.channel = await this.connection.createChannel();

      const queueName = `${this.QUEUE_PREFIX}${this.apiKey}`;
      await this.channel.assertQueue(queueName, { durable: true });

      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.emit('connected');

      this.connection.on('error', (err) => {
        this.emit('error', new Error(`RabbitMQ connection error: ${err.message}`));
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        this.emit('error', new Error('RabbitMQ connection closed'));
        this.emit('disconnected');
        this.handleDisconnect();
      });

      this.startProcessingMessages();
      this.startQueueMonitoring();
    } catch (error) {
      this.isConnecting = false;
      this.emit('error', new Error(`Failed to connect to RabbitMQ: ${(error as Error).message}`));
      this.handleDisconnect();
    }
  }

  /**
   * Обрабатывает отключение и пытается переподключиться
   * @private
   */
  private handleDisconnect(): void {
    this.emit('disconnected');

    this.channel = undefined;
    this.connection = undefined;
    this.processingMessages = false;
    this.consumerTag = undefined;

    if (this.checkQueueInterval) {
      clearInterval(this.checkQueueInterval);
      this.checkQueueInterval = undefined;
    }

    this.reconnectAttempts++;

    if (this.reconnectAttempts <= this.MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }

      this.reconnectTimeout = setTimeout(() => {
        this.connectToRabbitMQ();
      }, delay);
    } else {
      this.emit('error', new Error(`Failed to reconnect to RabbitMQ after ${this.MAX_RECONNECT_ATTEMPTS} attempts`));
    }
  }

  /**
   * Выполняет HTTP запрос к API
   * @param endpoint Конечная точка API
   * @param method HTTP метод
   * @param data Данные для отправки
   * @returns Ответ от сервера
   * @private
   */
  private async makeRequest(endpoint: string, method: string, data?: any) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: data ? JSON.stringify(data) : undefined
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Request failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  /**
   * Начинает мониторинг очереди сообщений для проверки новых рассылок
   * @private
   */
  private startQueueMonitoring(): void {
    if (this.checkQueueInterval) {
      clearInterval(this.checkQueueInterval);
    }

    this.checkQueueInterval = setInterval(async () => {
      if (!this.channel || !this.isConnected()) {
        return;
      }

      try {
        const queueName = `${this.QUEUE_PREFIX}${this.apiKey}`;
        const queueInfo = await this.channel.checkQueue(queueName);

        if (queueInfo.messageCount > 0 && !this.processingMessages) {
          this.emit('info', `New messages detected in queue (${queueInfo.messageCount}). Starting processing.`);
          await this.startProcessingMessages();
        }
      } catch (error) {
        this.emit('error', new Error(`Error checking queue: ${(error as Error).message}`));
      }
    }, 60000);
  }

  /**
   * Начинает обработку сообщений из очереди
   * @private
   */
  private async startProcessingMessages(): Promise<void> {
    if (!this.channel || this.processingMessages) return;

    this.processingMessages = true;
    const queueName = `${this.QUEUE_PREFIX}${this.apiKey}`;

    await this.channel.prefetch(this.BATCH_SIZE);

    const processingBatch: Promise<void>[] = [];

    this.consumerTag = (await this.channel.consume(queueName, async (msg) => {
      if (!msg) return;

      const processPromise = (async () => {
        const messageData: MessageQueueItem = JSON.parse(msg.content.toString());

        try {
          if (messageData.userId === 'all') {
            if (!this.migrateUsersHook) {
              this.emit('error', new Error('migrateUsersHook is required for processing messages with userId=all'));
              this.channel?.ack(msg);
              return;
            }

            const users = await this.migrateUsersHook();
            
            this.channel?.ack(msg);
            
            await Promise.all(
              users.map(async user => {
                const userId = user.tg.toString();
                const individualMessage: MessageQueueItem = {
                  userId,
                  message: messageData.message
                };
                
                return this.channel?.sendToQueue(
                  queueName,
                  Buffer.from(JSON.stringify(individualMessage)),
                  { persistent: true }
                );
              })
            );
            
            this.emit('info', `Broadcast with userId=all expanded to ${users.length} individual messages`);
            return;
          }

          if (this.callbackHookSendMessage) {
            await this.callbackHookSendMessage(messageData);
          }
          this.channel?.ack(msg);
          this.emit('messageSent', messageData.userId, true);
        } catch (error) {
          const errorData = JSON.parse((error as Error).message);

          if (errorData.error_code === 429) {
            this.channel?.sendToQueue(
              queueName,
              Buffer.from(JSON.stringify(messageData)),
              { persistent: true }
            );
            this.channel?.ack(msg);
            this.emit('error', new Error(`Rate limit hit when sending message to user ${messageData.userId}, retrying later`));
          } else {
            this.channel?.ack(msg);
            this.emit('messageSent', messageData.userId, false);
            this.emit('error', new Error(`Error sending message to user ${messageData.userId}: ${(error as Error).message}`));
          }
        }
      })();

      processingBatch.push(processPromise);

      if (processingBatch.length >= this.BATCH_SIZE) {
        const currentTime = Date.now();
        if (currentTime - this.lastBatchTime < this.BATCH_INTERVAL) {
          await new Promise(resolve => setTimeout(resolve, this.BATCH_INTERVAL - (currentTime - this.lastBatchTime)));
        }
        await Promise.all(processingBatch);
        this.lastBatchTime = Date.now();
        processingBatch.length = 0;
      }
    })).consumerTag;

    this.processIncompleteInterval = setInterval(async () => {
      if (processingBatch.length > 0) {
        const currentTime = Date.now();
        if (currentTime - this.lastBatchTime < this.BATCH_INTERVAL) {
          await new Promise(resolve => setTimeout(resolve, this.BATCH_INTERVAL - (currentTime - this.lastBatchTime)));
        }

        await Promise.all(processingBatch);
        this.lastBatchTime = Date.now();
        processingBatch.length = 0;
      }
    }, 500);
  }

  /**
   * Останавливает обработку сообщений
   * @private
   */
  private async stopProcessingMessages(): Promise<void> {
    if (!this.channel || !this.consumerTag || !this.processingMessages) return;

    if (this.processIncompleteInterval) {
      clearInterval(this.processIncompleteInterval);
      this.processIncompleteInterval = undefined;
    }

    await this.channel.cancel(this.consumerTag);
    this.processingMessages = false;
    this.consumerTag = undefined;
  }

  /**
   * Отправляет событие аналитики
   * @param event Событие для отправки
   */
  public async track(userId: string | number, type: string, payload: Event): Promise<void> {
    const { language = '', device = 'sdk', ...eventData } = payload;
    await this.makeRequest('/api/analytics/event', 'POST', {
      eventType: type,
      eventDetails: eventData,
      telegramId: userId.toString(),
      language,
      device
    });
  }

  /**
   * Идентифицирует пользователя
   * @param user Данные пользователя
   */
  public async identify(user: UserDetails): Promise<void> {
    await this.makeRequest('/api/analytics/identify', 'POST', user);
  }

  /**
   * Проверяет, установлено ли соединение с RabbitMQ
   * @returns true, если соединение установлено
   */
  public isConnected(): boolean {
    return !!this.connection && !!this.channel;
  }

  /**
   * Закрывает соединения при завершении работы
   */
  public async close(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.checkQueueInterval) {
      clearInterval(this.checkQueueInterval);
      this.checkQueueInterval = undefined;
    }

    await this.stopProcessingMessages();

    if (this.channel) {
      await this.channel.close();
    }

    if (this.connection) {
      await this.connection.close();
    }
  }

  /**
   * Создает новую рассылку
   * @param options Параметры рассылки
   * @param options.users Массив ID пользователей или 'all' для всех пользователей
   * @param options.content Контент рассылки
   * @returns Информация о созданной рассылке
   */
  public async broadcast(options: BroadcastOptions): Promise<{ broadcastId: string } | null> {
    if (!this.channel) {
      console.log('Connection is not established');
      return null;
    }

    let userIds: string[];

    if (options.users === 'all') {
      if (!this.migrateUsersHook) {
        console.log('migrateUsersHook is required for broadcasting to all users');
        return null;
      }

      const users = await this.migrateUsersHook();
      userIds = users.map(u => u.tg.toString());
    } else {
      userIds = options.users;
    }

    const broadcastId = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queueName = `${this.QUEUE_PREFIX}${this.apiKey}`;

    for (const userId of userIds) {
      const messageItem: MessageQueueItem = {
        userId,
        message: options.content
      };

      this.channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(messageItem)),
        { persistent: true }
      );
    }

    this.activeBroadcasts.add(broadcastId);

    return { broadcastId };
  }
}
