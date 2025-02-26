import CryptoJS from 'crypto-js';
type KeyIV = {
    key: CryptoJS.lib.WordArray;
    iv: CryptoJS.lib.WordArray;
};
export declare const rsaEncrypt: (publicKey: string, message: string) => string | false;
export declare const generateAESKeyAndIV: () => {
    key: CryptoJS.lib.WordArray;
    iv: CryptoJS.lib.WordArray;
};
export declare const encryptWithAES: ({ key, iv }: KeyIV, message: string) => string;
export declare const encryptMessage: (rsaPublicKey: string, message: string) => {
    encryptedKey: string;
    encryptedIV: string;
    encryptedBody: string;
};
export {};
