"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramerClient = void 0;
exports.composeMessage = composeMessage;
const events_1 = require("events");
const amqp = __importStar(require("amqplib"));
/**
 * Формирует сообщение для отправки в Telegram API
 * @param messageData Данные сообщения
 * @returns Подготовленные тип и тело запроса
 */
function composeMessage(messageData) {
    const { userId, message } = messageData;
    let type = '';
    let body = {};
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
            throw new Error(`Unsupported message type: ${message.type}`);
    }
    return { type, body };
}
class TelegramerClient extends events_1.EventEmitter {
    /**
     * Создает новый экземпляр клиента Telegramer
     * @param config Конфигурация клиента
     * @param config.apiKey API ключ проекта
     * @param config.baseUrl Базовый URL API
     * @param config.migrateUsersHook Опциональная функция для получения всех пользователей
     * @param config.callbackHookSendMessage Функция для отправки сообщений
     */
    constructor(config) {
        super();
        this.activeBroadcasts = new Set();
        this.QUEUE_PREFIX = "broadcast_";
        this.BATCH_SIZE = 20; // Packet size
        this.BATCH_INTERVAL = 1000; // One second interval
        this.processingMessages = false;
        this.reconnectAttempts = 0;
        this.MAX_RECONNECT_ATTEMPTS = 10;
        this.lastBatchTime = 0;
        this.isConnecting = false;
        this.connectionUrl = '';
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.telegramer.io';
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
    async setupConfig() {
        try {
            const config = await this.makeRequest('/api/sdk/config', 'GET');
            if (config.rabbitmq && config.rabbitmq.url) {
                this.connectionUrl = config.rabbitmq.url;
            }
            else {
                this.connectionUrl = 'amqp://localhost';
            }
            await this.connectToRabbitMQ();
        }
        catch (error) {
            this.connectionUrl = 'amqp://localhost';
            this.emit('error', new Error(`Failed to get config from API: ${error.message}. Using default connection.`));
            await this.connectToRabbitMQ();
        }
    }
    /**
     * Устанавливает соединение с RabbitMQ
     * @private
     */
    async connectToRabbitMQ() {
        if (this.isConnecting)
            return;
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
        }
        catch (error) {
            this.isConnecting = false;
            this.emit('error', new Error(`Failed to connect to RabbitMQ: ${error.message}`));
            this.handleDisconnect();
        }
    }
    /**
     * Обрабатывает отключение и пытается переподключиться
     * @private
     */
    handleDisconnect() {
        this.emit('disconnected');
        this.channel = undefined;
        this.connection = undefined;
        this.processingMessages = false;
        this.consumerTag = undefined;
        this.reconnectAttempts++;
        if (this.reconnectAttempts <= this.MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
            }
            this.reconnectTimeout = setTimeout(() => {
                this.connectToRabbitMQ();
            }, delay);
        }
        else {
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
    async makeRequest(endpoint, method, data) {
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
            throw new Error(`Request failed: ${response.status} ${errorText}`);
        }
        return response.json();
    }
    /**
     * Начинает обработку сообщений из очереди
     * @private
     */
    async startProcessingMessages() {
        if (!this.channel || this.processingMessages)
            return;
        this.processingMessages = true;
        const queueName = `${this.QUEUE_PREFIX}${this.apiKey}`;
        await this.channel.prefetch(this.BATCH_SIZE);
        const processingBatch = [];
        this.consumerTag = (await this.channel.consume(queueName, async (msg) => {
            if (!msg)
                return;
            const processPromise = (async () => {
                const messageData = JSON.parse(msg.content.toString());
                try {
                    if (this.callbackHookSendMessage) {
                        await this.callbackHookSendMessage(messageData);
                    }
                    this.channel?.ack(msg);
                    this.emit('messageSent', messageData.userId, true);
                }
                catch (error) {
                    const errorData = JSON.parse(error.message);
                    if (errorData.error_code === 429) {
                        this.channel?.sendToQueue(queueName, Buffer.from(JSON.stringify(messageData)), { persistent: true });
                        this.channel?.ack(msg);
                        this.emit('error', new Error(`Rate limit hit when sending message to user ${messageData.userId}, retrying later`));
                    }
                    else {
                        this.channel?.ack(msg);
                        this.emit('messageSent', messageData.userId, false);
                        this.emit('error', new Error(`Error sending message to user ${messageData.userId}: ${error.message}`));
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
    async stopProcessingMessages() {
        if (!this.channel || !this.consumerTag || !this.processingMessages)
            return;
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
    async track(userId, type, payload) {
        const { language = '', device = '', ...eventData } = payload;
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
    async identify(user) {
        await this.makeRequest('/api/analytics/identify', 'POST', user);
    }
    /**
     * Проверяет, установлено ли соединение с RabbitMQ
     * @returns true, если соединение установлено
     */
    isConnected() {
        return !!this.connection && !!this.channel;
    }
    /**
     * Закрывает соединения при завершении работы
     */
    async close() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = undefined;
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
    async broadcast(options) {
        if (!this.channel) {
            throw new Error('RabbitMQ connection is not established');
        }
        let userIds;
        if (options.users === 'all') {
            if (!this.migrateUsersHook) {
                throw new Error('migrateUsersHook is required for broadcasting to all users');
            }
            const users = await this.migrateUsersHook();
            userIds = users.map(u => u.tg.toString());
        }
        else {
            userIds = options.users;
        }
        const broadcastId = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const queueName = `${this.QUEUE_PREFIX}${this.apiKey}`;
        for (const userId of userIds) {
            const messageItem = {
                userId,
                message: options.content
            };
            this.channel.sendToQueue(queueName, Buffer.from(JSON.stringify(messageItem)), { persistent: true });
        }
        this.activeBroadcasts.add(broadcastId);
        return { broadcastId };
    }
}
exports.TelegramerClient = TelegramerClient;
