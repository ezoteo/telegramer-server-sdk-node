import { Event, TelegramerClientConfig } from './types/events';
import { UserData, BroadcastOptions, BroadcastStatus } from './types/broadcast';
import { EventEmitter } from 'events';

export declare interface TelegramerClient {
  on(event: 'endBroadcast', listener: (status: BroadcastStatus) => void): this;
}

export class TelegramerClient extends EventEmitter {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly migrateUsersHook?: () => Promise<UserData[]>;
  private readonly BATCH_SIZE = 100000;
  private readonly activeBroadcasts: Set<string> = new Set();
  private statusCheckInterval?: NodeJS.Timeout;

  /**
   * Создает новый экземпляр клиента Telegramer
   * @param config Конфигурация клиента
   * @param config.apiKey API ключ проекта
   * @param config.baseUrl Базовый URL API
   * @param config.migrateUsersHook Опциональная функция для получения всех пользователей
   */
  constructor(config: TelegramerClientConfig & {
    migrateUsersHook?: () => Promise<UserData[]>;
  }) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.migrateUsersHook = config.migrateUsersHook;
    this.startStatusCheck();
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
        'x-project-id': this.apiKey
      },
      body: data ? JSON.stringify(data) : undefined
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Request failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  /**
   * Проверяет статус активных рассылок
   * @private
   */
  private async checkBroadcastsStatus() {
    const broadcasts = Array.from(this.activeBroadcasts);
    for (const id of broadcasts) {
      try {
        const status: BroadcastStatus = await this.makeRequest(`/sdk/broadcast/${id}/status`, 'GET');
        if (status.stats.progress === 100) {
          this.activeBroadcasts.delete(id);
          this.emit('endBroadcast', status);
        }
      } catch (error) {
        console.error(`Failed to check broadcast ${id} status:`, error);
      }
    }

    if (this.activeBroadcasts.size === 0) {
      this.stopStatusCheck();
    }
  }

  /**
   * Запускает периодическую проверку статуса рассылок
   * @private
   */
  private startStatusCheck() {
    if (!this.statusCheckInterval) {
      this.statusCheckInterval = setInterval(() => this.checkBroadcastsStatus(), 10000);
    }
  }

  /**
   * Останавливает проверку статуса рассылок
   * @private
   */
  private stopStatusCheck() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = undefined;
    }
  }

  /**
   * Отправляет событие аналитики
   * @param event Событие для отправки
   */
  public async track(event: Event): Promise<void> {
    await this.makeRequest('/api/analytics', 'POST', event);
  }

  /**
   * Создает новую рассылку
   * @param options Параметры рассылки
   * @param options.users Массив ID пользователей или 'all' для всех пользователей
   * @param options.content Контент рассылки
   * @returns Информация о созданной рассылке
   */
  public async broadcast(options: BroadcastOptions) {
    if (options.users === 'all' && this.migrateUsersHook) {
      const users = await this.migrateUsersHook();
      const batches = [];
      for (let i = 0; i < users.length; i += this.BATCH_SIZE) {
        const batch = users.slice(i, i + this.BATCH_SIZE);
        batches.push(this.makeRequest('/sdk/users', 'POST', { 
          users: batch.map(u => u.tg.toString()) 
        }));
      }
      await Promise.all(batches);
    }

    const result = await this.makeRequest('/sdk/broadcast', 'POST', {
      content: options.content,
      users: options.users,
      timezone: options.timezone,
      scheduledFor: options.scheduledFor?.toISOString()
    });

    if (result.broadcastId) {
      this.activeBroadcasts.add(result.broadcastId);
      this.startStatusCheck();
    }

    return result;
  }
}
