import { Event, TelegramerClientConfig } from './types/events';
import { UserData, BroadcastOptions, BroadcastStatus } from './types/broadcast';
import { EventEmitter } from 'events';
export declare interface TelegramerClient {
    on(event: 'endBroadcast', listener: (status: BroadcastStatus) => void): this;
}
export declare class TelegramerClient extends EventEmitter {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly migrateUsersHook?;
    private readonly BATCH_SIZE;
    private readonly activeBroadcasts;
    private statusCheckInterval?;
    /**
     * Создает новый экземпляр клиента Telegramer
     * @param config Конфигурация клиента
     * @param config.apiKey API ключ проекта
     * @param config.baseUrl Базовый URL API
     * @param config.migrateUsersHook Опциональная функция для получения всех пользователей
     */
    constructor(config: TelegramerClientConfig & {
        migrateUsersHook?: () => Promise<UserData[]>;
    });
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
     * Проверяет статус активных рассылок
     * @private
     */
    private checkBroadcastsStatus;
    /**
     * Запускает периодическую проверку статуса рассылок
     * @private
     */
    private startStatusCheck;
    /**
     * Останавливает проверку статуса рассылок
     * @private
     */
    private stopStatusCheck;
    /**
     * Отправляет событие аналитики
     * @param event Событие для отправки
     */
    track(event: Event): Promise<void>;
    /**
     * Создает новую рассылку
     * @param options Параметры рассылки
     * @param options.users Массив ID пользователей или 'all' для всех пользователей
     * @param options.content Контент рассылки
     * @returns Информация о созданной рассылке
     */
    broadcast(options: BroadcastOptions): Promise<any>;
}
