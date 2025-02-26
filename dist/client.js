"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramerClient = void 0;
const crypto_js_1 = __importDefault(require("crypto-js"));
const events_1 = require("events");
class TelegramerClient extends events_1.EventEmitter {
    /**
     * Создает новый экземпляр клиента Telegramer
     * @param config Конфигурация клиента
     * @param config.apiKey API ключ проекта
     * @param config.apiSecret Секретный ключ для шифрования
     * @param config.baseUrl Базовый URL API
     * @param config.migrateUsersHook Опциональная функция для получения всех пользователей
     */
    constructor(config) {
        super();
        this.BATCH_SIZE = 100000;
        this.activeBroadcasts = new Set();
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;
        this.baseUrl = config.baseUrl;
        this.migrateUsersHook = config.migrateUsersHook;
        this.startStatusCheck();
    }
    /**
     * Шифрует данные для отправки на сервер
     * @param data Данные для шифрования
     * @returns Зашифрованные данные
     * @private
     */
    encrypt(data) {
        const iv = crypto_js_1.default.lib.WordArray.random(16);
        const jsonData = JSON.stringify(data);
        const encrypted = crypto_js_1.default.AES.encrypt(jsonData, this.apiSecret, {
            iv: iv,
            mode: crypto_js_1.default.mode.CBC,
            padding: crypto_js_1.default.pad.Pkcs7
        });
        return {
            key: this.apiKey,
            iv: iv.toString(),
            body: encrypted.toString()
        };
    }
    /**
     * Выполняет HTTP запрос к API
     * @param endpoint Конечная точка API
     * @param method HTTP метод
     * @param data Данные для отправки
     * @returns Ответ от сервера
     * @private
     */
    async makeRequest(endpoint, method, data) {
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
    async checkBroadcastsStatus() {
        const broadcasts = Array.from(this.activeBroadcasts);
        for (const id of broadcasts) {
            try {
                const status = await this.makeRequest(`/sdk/broadcast/${id}/status`, 'GET');
                if (status.stats.progress === 100) {
                    this.activeBroadcasts.delete(id);
                    this.emit('endBroadcast', status);
                }
            }
            catch (error) {
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
    startStatusCheck() {
        if (!this.statusCheckInterval) {
            this.statusCheckInterval = setInterval(() => this.checkBroadcastsStatus(), 10000);
        }
    }
    /**
     * Останавливает проверку статуса рассылок
     * @private
     */
    stopStatusCheck() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = undefined;
        }
    }
    /**
     * Отправляет событие аналитики
     * @param event Событие для отправки
     */
    async track(event) {
        const encryptedData = this.encrypt(event);
        const response = await fetch(`${this.baseUrl}/api/analytics`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(encryptedData)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to send event: ${response.status} ${errorText}`);
        }
    }
    /**
     * Создает новую рассылку
     * @param options Параметры рассылки
     * @param options.users Массив ID пользователей или 'all' для всех пользователей
     * @param options.content Контент рассылки
     * @returns Информация о созданной рассылке
     */
    async broadcast(options) {
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
exports.TelegramerClient = TelegramerClient;
