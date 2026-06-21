export declare class JwtHelper {
    private static base64UrlEncode;
    private static base64UrlDecode;
    static sign(payload: any, secret: string, expiresInSeconds: number): string;
    static verify(token: string, secret: string): any;
}
export declare class PasswordHelper {
    static hash(password: string, salt?: string): string;
    static verify(password: string, storedHash: string): boolean;
}
