import {
  bigint,
  index,
  json,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";

export const tenants = mysqlTable("tenants", {
  id: varchar("id", { length: 64 }).primaryKey(),
  alibabaUserId: varchar("alibaba_user_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow()
}, (table) => [uniqueIndex("uq_tenants_alibaba_user").on(table.alibabaUserId)]);

export const alibabaAuthorizations = mysqlTable("alibaba_authorizations", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  memberId: varchar("member_id", { length: 128 }),
  accessTokenEncrypted: varchar("access_token_encrypted", { length: 2048 }).notNull(),
  refreshTokenEncrypted: varchar("refresh_token_encrypted", { length: 2048 }),
  expiresAt: timestamp("expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow()
}, (table) => [uniqueIndex("uq_alibaba_auth_tenant").on(table.tenantId)]);

export const offerSnapshots = mysqlTable("offer_snapshots", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  offerId: varchar("offer_id", { length: 64 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  categoryId: varchar("category_id", { length: 64 }).notNull(),
  payload: json("payload").notNull(),
  importedAt: timestamp("imported_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow()
}, (table) => [
  uniqueIndex("uq_offer_snapshot_tenant_offer").on(table.tenantId, table.offerId),
  index("idx_offer_snapshot_tenant").on(table.tenantId)
]);
