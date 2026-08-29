import { sql } from "drizzle-orm";
import {
  bigint,
  datetime,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";

export const tenants = mysqlTable("tenants", {
  id: varchar("id", { length: 64 }).primaryKey(),
  alibabaUserId: varchar("alibaba_user_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow()
}, (table) => [uniqueIndex("uq_tenants_alibaba_user").on(table.alibabaUserId)]);

export const alibabaAuthorizations = mysqlTable("alibaba_authorizations", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  memberId: varchar("member_id", { length: 128 }),
  accessTokenEncrypted: varchar("access_token_encrypted", { length: 2048 }).notNull(),
  refreshTokenEncrypted: varchar("refresh_token_encrypted", { length: 2048 }),
  expiresAt: datetime("expires_at", { mode: "date" }),
  refreshTokenExpiresAt: datetime("refresh_token_expires_at", { mode: "date" }),
  status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow()
}, (table) => [uniqueIndex("uq_alibaba_auth_tenant").on(table.tenantId)]);

export const offerSnapshots = mysqlTable("offer_snapshots", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  offerId: varchar("offer_id", { length: 64 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  categoryId: varchar("category_id", { length: 64 }).notNull(),
  payload: json("payload").notNull(),
  importedAt: timestamp("imported_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  uniqueIndex("uq_offer_snapshot_tenant_offer").on(table.tenantId, table.offerId),
  index("idx_offer_snapshot_tenant").on(table.tenantId)
]);

export const wechatStores = mysqlTable("wechat_stores", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  appIdHash: varchar("app_id_hash", { length: 64 }).notNull(),
  appIdEncrypted: varchar("app_id_encrypted", { length: 1024 }).notNull(),
  appSecretEncrypted: varchar("app_secret_encrypted", { length: 2048 }).notNull(),
  platform: varchar("platform", { length: 32 }).notNull().default("WECHAT_SHOP"),
  status: varchar("status", { length: 32 }).notNull().default("NORMAL"),
  statusMessage: varchar("status_message", { length: 500 }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow()
}, (table) => [
  uniqueIndex("uq_wechat_store_tenant_app").on(table.tenantId, table.appIdHash),
  index("idx_wechat_store_tenant").on(table.tenantId)
]);

export const distributionBatches = mysqlTable("distribution_batches", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  recordNumber: int("record_number", { unsigned: true }).notNull(),
  strategy: varchar("strategy", { length: 32 }).notNull(),
  targetStoreCount: int("target_store_count", { unsigned: true }).notNull(),
  taskCount: int("task_count", { unsigned: true }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("QUEUED"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow()
}, (table) => [
  uniqueIndex("uq_distribution_batch_record").on(table.tenantId, table.recordNumber),
  index("idx_distribution_batch_tenant").on(table.tenantId),
  index("idx_distribution_batch_updated").on(table.updatedAt)
]);

export const distributionJobs = mysqlTable("distribution_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  batchId: varchar("batch_id", { length: 36 }).notNull(),
  offerId: varchar("offer_id", { length: 64 }).notNull(),
  offerTitle: varchar("offer_title", { length: 512 }).notNull(),
  storeId: varchar("store_id", { length: 36 }).notNull(),
  storeName: varchar("store_name", { length: 80 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("QUEUED"),
  statusMessage: text("status_message"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow()
}, (table) => [
  index("idx_distribution_job_tenant").on(table.tenantId),
  index("idx_distribution_job_batch").on(table.batchId),
  index("idx_distribution_job_status").on(table.status)
]);
