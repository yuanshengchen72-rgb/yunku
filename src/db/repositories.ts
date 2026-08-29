import mysql, { type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { and, eq } from "drizzle-orm";
import path from "node:path";
import type {
  AlibabaAuthorization,
  AlibabaAuthorizationRepository
} from "../connectors/alibaba1688/auth-store.js";
import { TokenCipher } from "../connectors/alibaba1688/auth-store.js";
import type { OfferSnapshotRepository } from "../domain/ports.js";
import { offerSnapshotSchema, type OfferSnapshot } from "../shared/contracts.js";
import { alibabaAuthorizations, offerSnapshots, tenants } from "./schema.js";

type Database = MySql2Database<Record<string, never>>;

export interface MySqlRuntimeRepositories {
  pool: Pool;
  authorizations: AlibabaAuthorizationRepository;
  offers: OfferSnapshotRepository;
}

export async function createMySqlRuntimeRepositories(
  mysqlUrl: string,
  cipher: TokenCipher,
  migrationsFolder = path.resolve(process.cwd(), "drizzle")
): Promise<MySqlRuntimeRepositories> {
  const pool = mysql.createPool(mysqlUrl);
  const database = drizzle(pool);
  try {
    await migrate(database, { migrationsFolder });
  } catch (error) {
    await pool.end();
    throw error;
  }
  return {
    pool,
    authorizations: new MySqlAlibabaAuthorizationRepository(database, cipher),
    offers: new MySqlOfferSnapshotRepository(database)
  };
}

class MySqlAlibabaAuthorizationRepository implements AlibabaAuthorizationRepository {
  constructor(
    private readonly database: Database,
    private readonly cipher: TokenCipher
  ) {}

  async upsert(authorization: AlibabaAuthorization): Promise<void> {
    const now = new Date();
    await this.database.insert(tenants).values({
      id: authorization.tenantId,
      alibabaUserId: authorization.alibabaUserId,
      updatedAt: now
    }).onDuplicateKeyUpdate({
      set: { alibabaUserId: authorization.alibabaUserId, updatedAt: now }
    });

    await this.database.insert(alibabaAuthorizations).values({
      tenantId: authorization.tenantId,
      memberId: authorization.memberId,
      accessTokenEncrypted: this.cipher.encrypt(authorization.accessToken),
      refreshTokenEncrypted: authorization.refreshToken
        ? this.cipher.encrypt(authorization.refreshToken)
        : null,
      expiresAt: authorization.accessTokenExpiresAt,
      refreshTokenExpiresAt: authorization.refreshTokenExpiresAt,
      status: "ACTIVE",
      updatedAt: now
    }).onDuplicateKeyUpdate({
      set: {
        memberId: authorization.memberId,
        accessTokenEncrypted: this.cipher.encrypt(authorization.accessToken),
        refreshTokenEncrypted: authorization.refreshToken
          ? this.cipher.encrypt(authorization.refreshToken)
          : null,
        expiresAt: authorization.accessTokenExpiresAt,
        refreshTokenExpiresAt: authorization.refreshTokenExpiresAt,
        status: "ACTIVE",
        updatedAt: now
      }
    });
  }

  async findByTenantId(tenantId: string): Promise<AlibabaAuthorization | undefined> {
    const [tenant] = await this.database.select().from(tenants)
      .where(eq(tenants.id, tenantId)).limit(1);
    const [authorization] = await this.database.select().from(alibabaAuthorizations)
      .where(and(
        eq(alibabaAuthorizations.tenantId, tenantId),
        eq(alibabaAuthorizations.status, "ACTIVE")
      )).limit(1);
    if (!tenant || !authorization) return undefined;
    return {
      tenantId,
      alibabaUserId: tenant.alibabaUserId,
      memberId: authorization.memberId ?? undefined,
      accessToken: this.cipher.decrypt(authorization.accessTokenEncrypted),
      refreshToken: authorization.refreshTokenEncrypted
        ? this.cipher.decrypt(authorization.refreshTokenEncrypted)
        : undefined,
      accessTokenExpiresAt: authorization.expiresAt ?? undefined,
      refreshTokenExpiresAt: authorization.refreshTokenExpiresAt ?? undefined
    };
  }
}

class MySqlOfferSnapshotRepository implements OfferSnapshotRepository {
  constructor(private readonly database: Database) {}

  async save(tenantId: string, snapshot: OfferSnapshot): Promise<void> {
    await this.database.insert(offerSnapshots).values({
      tenantId,
      offerId: snapshot.offerId,
      title: snapshot.title,
      categoryId: snapshot.categoryId,
      payload: snapshot,
      importedAt: new Date(snapshot.importedAt)
    }).onDuplicateKeyUpdate({
      set: {
        title: snapshot.title,
        categoryId: snapshot.categoryId,
        payload: snapshot,
        importedAt: new Date(snapshot.importedAt)
      }
    });
  }

  async findByOfferId(tenantId: string, offerId: string): Promise<OfferSnapshot | undefined> {
    const [row] = await this.database.select().from(offerSnapshots)
      .where(and(eq(offerSnapshots.tenantId, tenantId), eq(offerSnapshots.offerId, offerId)))
      .limit(1);
    return row ? offerSnapshotSchema.parse(row.payload) : undefined;
  }
}
