import { Event, TelegramerClientConfig, UserDetails } from './types/events';
import { BroadcastOptions, MessageQueueItem } from './types/broadcast';
import { EventEmitter } from 'events';
/**
 * Формирует сообщение для отправки в Telegram API
 * @param messageData Данные сообщения
 * @returns Подготовленные тип и тело запроса
 */
export declare function composeMessage(messageData: MessageQueueItem): {
    type: string;
    body: any;
};
export declare interface TelegramerClient {
    on(event: 'messageSent', listener: (userId: string, success: boolean) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'connected', listener: () => void): this;
    on(event: 'disconnected', listener: () => void): this;
}
export declare class TelegramerClient extends EventEmitter {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly migrateUsersHook?;
    private readonly activeBroadcasts;
    private readonly callbackHookSendMessage?;
    private connection?;
    private channel?;
    private readonly QUEUE_PREFIX;
    private readonly BATCH_SIZE;
    private readonly BATCH_INTERVAL;
    private processingMessages;
    private consumerTag?;
    private reconnectAttempts;
    private readonly MAX_RECONNECT_ATTEMPTS;
    private reconnectTimeout?;
    private processIncompleteInterval?;
    private lastBatchTime;
    private isConnecting;
    private connectionUrl;
    /**
     * Создает новый экземпляр клиента Telegramer
     * @param config Конфигурация клиента
     * @param config.apiKey API ключ проекта
     * @param config.baseUrl Базовый URL API
     * @param config.migrateUsersHook Опциональная функция для получения всех пользователей
     * @param config.callbackHookSendMessage Функция для отправки сообщений
     */
    constructor(config: TelegramerClientConfig);
    /**
     * Получает конфигурацию из API и устанавливает параметры подключения
     * @private
     */
    private setupConfig;
    /**
     * Устанавливает соединение с RabbitMQ
     * @private
     */
    private connectToRabbitMQ;
    /**
     * Обрабатывает отключение и пытается переподключиться
     * @private
     */
    private handleDisconnect;
    /**
     * Выполняет HTTP запрос к API
     * @param endpoint Конечная точка API
     * @param method HTTP метод
     * @param data Данные для отправки
     * @returns Ответ от сервера
     * @private
     */
    private makeRequest;
    /**
     * Начинает обработку сообщений из очереди
     * @private
     */
    private startProcessingMessages;
    /**
     * Останавливает обработку сообщений
     * @private
     */
    private stopProcessingMessages;
    /**
     * Отправляет событие аналитики
     * @param event Событие для отправки
     */
    track(event: Event): Promise<void>;
    /**
     * Идентифицирует пользователя
     * @param user Данные пользователя
     */
    identify(user: UserDetails): Promise<void>;
    /**
     * Проверяет, установлено ли соединение с RabbitMQ
     * @returns true, если соединение установлено
     */
    isConnected(): boolean;
    /**
     * Закрывает соединения при завершении работы
     */
    close(): Promise<void>;
    /**
     * Создает новую рассылку
     * @param options Параметры рассылки
     * @param options.users Массив ID пользователей или 'all' для всех пользователей
     * @param options.content Контент рассылки
     * @returns Информация о созданной рассылке
     */
    broadcast(options: BroadcastOptions): Promise<{
        broadcastId: string;
    }>;
}
