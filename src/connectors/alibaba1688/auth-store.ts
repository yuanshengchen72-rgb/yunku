import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface AlibabaAuthorization {
  tenantId: string;
  alibabaUserId: string;
  memberId?: string | undefined;
  accessToken: string;
  refreshToken?: string | undefined;
  accessTokenExpiresAt?: Date | undefined;
  refreshTokenExpiresAt?: Date | undefined;
}

export interface AlibabaAuthorizationRepository {
  upsert(authorization: AlibabaAuthorization): Promise<void>;
  findByTenantId(tenantId: string): Promise<AlibabaAuthorization | undefined>;
}

interface EncryptedAuthorization extends Omit<AlibabaAuthorization, "accessToken" | "refreshToken"> {
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string | undefined;
}

export class TokenCipher {
  constructor(private readonly key: Buffer) {
    if (key.byteLength !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY 解码后必须正好是 32 字节");
    }
  }

  static fromBase64(encodedKey: string): TokenCipher {
    return new TokenCipher(Buffer.from(encodedKey, "base64"));
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
  }

  decrypt(payload: string): string {
    const [version, ivText, tagText, encryptedText] = payload.split(":");
    if (version !== "v1" || !ivText || !tagText || encryptedText === undefined) {
      throw new Error("无法识别的令牌密文格式");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }
}

export class EncryptedInMemoryAlibabaAuthorizationRepository
implements AlibabaAuthorizationRepository {
  private readonly records = new Map<string, EncryptedAuthorization>();

  constructor(private readonly cipher: TokenCipher) {}

  async upsert(authorization: AlibabaAuthorization): Promise<void> {
    this.records.set(authorization.tenantId, {
      tenantId: authorization.tenantId,
      alibabaUserId: authorization.alibabaUserId,
      memberId: authorization.memberId,
      accessTokenEncrypted: this.cipher.encrypt(authorization.accessToken),
      refreshTokenEncrypted: authorization.refreshToken
        ? this.cipher.encrypt(authorization.refreshToken)
        : undefined,
      accessTokenExpiresAt: authorization.accessTokenExpiresAt,
      refreshTokenExpiresAt: authorization.refreshTokenExpiresAt
    });
  }

  async findByTenantId(tenantId: string): Promise<AlibabaAuthorization | undefined> {
    const record = this.records.get(tenantId);
    if (!record) return undefined;
    return {
      tenantId: record.tenantId,
      alibabaUserId: record.alibabaUserId,
      memberId: record.memberId,
      accessToken: this.cipher.decrypt(record.accessTokenEncrypted),
      refreshToken: record.refreshTokenEncrypted
        ? this.cipher.decrypt(record.refreshTokenEncrypted)
        : undefined,
      accessTokenExpiresAt: record.accessTokenExpiresAt,
      refreshTokenExpiresAt: record.refreshTokenExpiresAt
    };
  }
}
