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
exports.PasswordHelper = exports.JwtHelper = void 0;
const crypto = __importStar(require("crypto"));
class JwtHelper {
    static base64UrlEncode(str) {
        return Buffer.from(str)
            .toString('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    }
    static base64UrlDecode(str) {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
            base64 += '=';
        }
        return Buffer.from(base64, 'base64').toString('utf8');
    }
    static sign(payload, secret, expiresInSeconds) {
        const header = { alg: 'HS256', typ: 'JWT' };
        const headerStr = this.base64UrlEncode(JSON.stringify(header));
        const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
        const fullPayload = { ...payload, exp };
        const payloadStr = this.base64UrlEncode(JSON.stringify(fullPayload));
        const signatureInput = `${headerStr}.${payloadStr}`;
        const signature = crypto
            .createHmac('sha256', secret)
            .update(signatureInput)
            .digest('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
        return `${signatureInput}.${signature}`;
    }
    static verify(token, secret) {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid token structure');
        }
        const [headerStr, payloadStr, signature] = parts;
        const signatureInput = `${headerStr}.${payloadStr}`;
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(signatureInput)
            .digest('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
        if (signature !== expectedSignature) {
            throw new Error('Signature verification failed');
        }
        const payload = JSON.parse(this.base64UrlDecode(payloadStr));
        if (payload.exp && Date.now() / 1000 > payload.exp) {
            throw new Error('Token has expired');
        }
        return payload;
    }
}
exports.JwtHelper = JwtHelper;
class PasswordHelper {
    static hash(password, salt = crypto.randomBytes(16).toString('hex')) {
        const hash = crypto
            .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
            .toString('hex');
        return `${salt}:${hash}`;
    }
    static verify(password, storedHash) {
        const parts = storedHash.split(':');
        if (parts.length !== 2)
            return false;
        const [salt, hash] = parts;
        const verifyHash = crypto
            .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
            .toString('hex');
        return hash === verifyHash;
    }
}
exports.PasswordHelper = PasswordHelper;
//# sourceMappingURL=crypto.helper.js.map