CREATE TABLE `alibaba_authorizations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`member_id` varchar(128),
	`access_token_encrypted` varchar(2048) NOT NULL,
	`refresh_token_encrypted` varchar(2048),
	`expires_at` datetime,
	`refresh_token_expires_at` datetime,
	`status` varchar(32) NOT NULL DEFAULT 'ACTIVE',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alibaba_authorizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_alibaba_auth_tenant` UNIQUE(`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `offer_snapshots` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`offer_id` varchar(64) NOT NULL,
	`title` varchar(512) NOT NULL,
	`category_id` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`imported_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `offer_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_offer_snapshot_tenant_offer` UNIQUE(`tenant_id`,`offer_id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` varchar(64) NOT NULL,
	`alibaba_user_id` varchar(128) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_tenants_alibaba_user` UNIQUE(`alibaba_user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_offer_snapshot_tenant` ON `offer_snapshots` (`tenant_id`);
