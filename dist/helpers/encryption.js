"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptMessage = exports.encryptWithAES = exports.generateAESKeyAndIV = exports.rsaEncrypt = void 0;
const crypto_js_1 = __importDefault(require("crypto-js"));
const jsencrypt_1 = require("jsencrypt");
const rsaEncrypt = (publicKey, message) => {
    const jsEncrypt = new jsencrypt_1.JSEncrypt();
    jsEncrypt.setPublicKey(publicKey);
    return jsEncrypt.encrypt(message);
};
exports.rsaEncrypt = rsaEncrypt;
const generateAESKeyAndIV = () => {
    const key = crypto_js_1.default.lib.WordArray.random(16);
    const iv = crypto_js_1.default.lib.WordArray.random(16);
    return { key, iv };
};
exports.generateAESKeyAndIV = generateAESKeyAndIV;
const encryptWithAES = ({ key, iv }, message) => {
    const encrypted = crypto_js_1.default.AES.encrypt(message, key, { iv });
    return encrypted.toString();
};
exports.encryptWithAES = encryptWithAES;
const encryptMessage = (rsaPublicKey, message) => {
    const { key, iv } = (0, exports.generateAESKeyAndIV)();
    const keyString = key.toString();
    const ivString = iv.toString();
    const encryptedKey = (0, exports.rsaEncrypt)(rsaPublicKey, keyString);
    if (encryptedKey === false) {
        throw new Error('Failed to encrypt AES key.');
    }
    const encryptedIV = (0, exports.rsaEncrypt)(rsaPublicKey, ivString);
    if (encryptedIV === false) {
        throw new Error('Failed to encrypt AES IV.');
    }
    const encryptedBody = (0, exports.encryptWithAES)({ key, iv }, message);
    return { encryptedKey, encryptedIV, encryptedBody };
};
exports.encryptMessage = encryptMessage;
