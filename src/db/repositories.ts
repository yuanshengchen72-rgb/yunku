import mysql, { type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import path from "node:path";
import type {
  AlibabaAuthorization,
  AlibabaAuthorizationRepository
} from "../connectors/alibaba1688/auth-store.js";
import { TokenCipher } from "../connectors/alibaba1688/auth-store.js";
import type {
  DistributionRepository,
  OfferSnapshotRepository,
  WechatStoreRepository,
  WechatStoreSecret
} from "../domain/ports.js";
import { maskAppId, resolveDistributionAssignments } from "../domain/ports.js";
import {
  distributionBatchSchema,
  distributionJobSchema,
  offerSnapshotSchema,
  type DistributionBatch,
  type DistributionJob,
  type DistributionStrategy,
  type OfferSnapshot,
  type WechatStore
} from "../shared/contracts.js";
import {
  alibabaAuthorizations,
  distributionBatches,
  distributionJobs,
  offerSnapshots,
  tenants,
  wechatStores
} from "./schema.js";

type Database = MySql2Database<Record<string, never>>;

export interface MySqlRuntimeRepositories {
  pool: Pool;
  authorizations: AlibabaAuthorizationRepository;
  offers: OfferSnapshotRepository;
  stores: WechatStoreRepository;
  distributions: DistributionRepository;
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
    offers: new MySqlOfferSnapshotRepository(database),
    stores: new MySqlWechatStoreRepository(database, cipher),
    distributions: new MySqlDistributionRepository(database)
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

  async list(tenantId: string, query = ""): Promise<OfferSnapshot[]> {
    const rows = await this.database.select().from(offerSnapshots)
      .where(eq(offerSnapshots.tenantId, tenantId))
      .orderBy(desc(offerSnapshots.importedAt));
    const normalized = query.trim().toLowerCase();
    return rows
      .map((row) => offerSnapshotSchema.parse(row.payload))
      .filter((snapshot) => !normalized
        || snapshot.title.toLowerCase().includes(normalized)
        || snapshot.offerId.includes(normalized));
  }
}

class MySqlWechatStoreRepository implements WechatStoreRepository {
  constructor(
    private readonly database: Database,
    private readonly cipher: TokenCipher
  ) {}

  async list(tenantId: string): Promise<WechatStore[]> {
    const rows = await this.database.select().from(wechatStores)
      .where(eq(wechatStores.tenantId, tenantId))
      .orderBy(desc(wechatStores.updatedAt));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      appIdMasked: maskAppId(this.cipher.decrypt(row.appIdEncrypted)),
      platform: "WECHAT_SHOP" as const,
      status: row.status as WechatStore["status"],
      ...(row.statusMessage ? { statusMessage: row.statusMessage } : {}),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  async findSecret(tenantId: string, storeId: string): Promise<WechatStoreSecret | undefined> {
    const [row] = await this.database.select().from(wechatStores).where(and(
      eq(wechatStores.tenantId, tenantId),
      eq(wechatStores.id, storeId)
    )).limit(1);
    if (!row) return undefined;
    return {
      store: {
        id: row.id,
        name: row.name,
        appIdMasked: maskAppId(this.cipher.decrypt(row.appIdEncrypted)),
        platform: "WECHAT_SHOP",
        status: row.status as WechatStore["status"],
        ...(row.statusMessage ? { statusMessage: row.statusMessage } : {}),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      },
      appId: this.cipher.decrypt(row.appIdEncrypted),
      appSecret: this.cipher.decrypt(row.appSecretEncrypted)
    };
  }

  async save(tenantId: string, input: {
    id: string;
    name: string;
    appId: string;
    appSecret: string;
    status: WechatStore["status"];
    statusMessage?: string;
  }): Promise<WechatStore> {
    const now = new Date();
    const appIdHash = createHash("sha256").update(input.appId).digest("hex");
    const [existing] = await this.database.select({ id: wechatStores.id })
      .from(wechatStores)
      .where(and(
        eq(wechatStores.tenantId, tenantId),
        eq(wechatStores.appIdHash, appIdHash)
      ))
      .limit(1);
    const storeId = existing?.id ?? input.id;
    await this.database.insert(wechatStores).values({
      id: storeId,
      tenantId,
      name: input.name,
      appIdHash,
      appIdEncrypted: this.cipher.encrypt(input.appId),
      appSecretEncrypted: this.cipher.encrypt(input.appSecret),
      status: input.status,
      statusMessage: input.statusMessage ?? null,
      updatedAt: now
    }).onDuplicateKeyUpdate({
      set: {
        name: input.name,
        appIdEncrypted: this.cipher.encrypt(input.appId),
        appSecretEncrypted: this.cipher.encrypt(input.appSecret),
        status: input.status,
        statusMessage: input.statusMessage ?? null,
        updatedAt: now
      }
    });
    const secret = await this.findSecret(tenantId, storeId);
    if (!secret) throw new Error("微信小店保存失败");
    return secret.store;
  }

  async remove(tenantId: string, storeId: string): Promise<boolean> {
    const result = await this.database.delete(wechatStores).where(and(
      eq(wechatStores.tenantId, tenantId),
      eq(wechatStores.id, storeId)
    ));
    return Number(result[0].affectedRows) > 0;
  }
}

class MySqlDistributionRepository implements DistributionRepository {
  constructor(private readonly database: Database) {}

  async createBatch(tenantId: string, input: {
    offerIds: string[];
    stores: WechatStore[];
    offers: OfferSnapshot[];
    strategy: DistributionStrategy;
    manualAssignments?: Array<{ offerId: string; storeId: string }>;
  }): Promise<DistributionBatch> {
    const countRows = await this.database.select({ value: count() }).from(distributionBatches)
      .where(eq(distributionBatches.tenantId, tenantId));
    const id = randomUUID();
    const recordNumber = Number(countRows[0]?.value ?? 0) + 1;
    const now = new Date();
    const offerById = new Map(input.offers.map((offer) => [offer.offerId, offer]));
    const assignments = resolveDistributionAssignments(input);
    const jobs = assignments.map(({ offerId, store }) => ({
      id: randomUUID(),
      tenantId,
      batchId: id,
      offerId,
      offerTitle: offerById.get(offerId)?.title ?? offerId,
      storeId: store.id,
      storeName: store.name,
      status: "QUEUED",
      statusMessage: "已创建铺货任务，等待执行",
      createdAt: now,
      updatedAt: now
    }));
    await this.database.transaction(async (transaction) => {
      await transaction.insert(distributionBatches).values({
        id,
        tenantId,
        recordNumber,
        strategy: input.strategy,
        targetStoreCount: input.stores.length,
        taskCount: jobs.length,
        status: "QUEUED",
        createdAt: now,
        updatedAt: now
      });
      await transaction.insert(distributionJobs).values(jobs);
    });
    return distributionBatchSchema.parse({
      id,
      recordNumber,
      strategy: input.strategy,
      targetStoreCount: input.stores.length,
      taskCount: jobs.length,
      status: "QUEUED",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      jobs: jobs.map((job) => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString()
      }))
    });
  }

  async listBatches(tenantId: string): Promise<DistributionBatch[]> {
    const rows = await this.database.select().from(distributionBatches)
      .where(eq(distributionBatches.tenantId, tenantId))
      .orderBy(desc(distributionBatches.updatedAt));
    return rows.map((row) => distributionBatchSchema.parse({
      id: row.id,
      recordNumber: row.recordNumber,
      strategy: row.strategy,
      targetStoreCount: row.targetStoreCount,
      taskCount: row.taskCount,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  async findBatch(tenantId: string, batchId: string): Promise<DistributionBatch | undefined> {
    const [batch] = await this.database.select().from(distributionBatches).where(and(
      eq(distributionBatches.tenantId, tenantId),
      eq(distributionBatches.id, batchId)
    )).limit(1);
    if (!batch) return undefined;
    const jobs = await this.database.select().from(distributionJobs).where(and(
      eq(distributionJobs.tenantId, tenantId),
      eq(distributionJobs.batchId, batchId)
    ));
    return distributionBatchSchema.parse({
      id: batch.id,
      recordNumber: batch.recordNumber,
      strategy: batch.strategy,
      targetStoreCount: batch.targetStoreCount,
      taskCount: batch.taskCount,
      status: batch.status,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
      jobs: jobs.map((job) => distributionJobSchema.parse({
        id: job.id,
        batchId: job.batchId,
        offerId: job.offerId,
        offerTitle: job.offerTitle,
        storeId: job.storeId,
        storeName: job.storeName,
        status: job.status,
        ...(job.statusMessage ? { statusMessage: job.statusMessage } : {}),
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString()
      }))
    });
  }

  async updateExecution(tenantId: string, batchId: string, input: {
    status: DistributionBatch["status"];
    jobs: Array<{
      id: string;
      status: DistributionJob["status"];
      statusMessage?: string;
    }>;
  }): Promise<DistributionBatch | undefined> {
    const now = new Date();
    await this.database.transaction(async (transaction) => {
      for (const job of input.jobs) {
        await transaction.update(distributionJobs).set({
          status: job.status,
          statusMessage: job.statusMessage ?? null,
          updatedAt: now
        }).where(and(
          eq(distributionJobs.tenantId, tenantId),
          eq(distributionJobs.batchId, batchId),
          eq(distributionJobs.id, job.id)
        ));
      }
      await transaction.update(distributionBatches).set({
        status: input.status,
        updatedAt: now
      }).where(and(
        eq(distributionBatches.tenantId, tenantId),
        eq(distributionBatches.id, batchId)
      ));
    });
    return this.findBatch(tenantId, batchId);
  }

  async listPending(limit = 20): Promise<Array<{ tenantId: string; batchId: string }>> {
    const rows = await this.database.select({
      tenantId: distributionBatches.tenantId,
      batchId: distributionBatches.id
    }).from(distributionBatches)
      .where(inArray(distributionBatches.status, ["QUEUED", "RUNNING"]))
      .orderBy(asc(distributionBatches.updatedAt))
      .limit(limit);
    return rows;
  }
}
