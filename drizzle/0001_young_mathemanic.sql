CREATE TABLE `distribution_batches` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`record_number` int unsigned NOT NULL,
	`strategy` varchar(32) NOT NULL,
	`target_store_count` int unsigned NOT NULL,
	`task_count` int unsigned NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'QUEUED',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `distribution_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_distribution_batch_record` UNIQUE(`tenant_id`,`record_number`)
);
--> statement-breakpoint
CREATE TABLE `distribution_jobs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`batch_id` varchar(36) NOT NULL,
	`offer_id` varchar(64) NOT NULL,
	`offer_title` varchar(512) NOT NULL,
	`store_id` varchar(36) NOT NULL,
	`store_name` varchar(80) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'QUEUED',
	`status_message` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `distribution_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wechat_stores` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`name` varchar(80) NOT NULL,
	`app_id_hash` varchar(64) NOT NULL,
	`app_id_encrypted` varchar(1024) NOT NULL,
	`app_secret_encrypted` varchar(2048) NOT NULL,
	`platform` varchar(32) NOT NULL DEFAULT 'WECHAT_SHOP',
	`status` varchar(32) NOT NULL DEFAULT 'NORMAL',
	`status_message` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wechat_stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_wechat_store_tenant_app` UNIQUE(`tenant_id`,`app_id_hash`)
);
--> statement-breakpoint
CREATE INDEX `idx_distribution_batch_tenant` ON `distribution_batches` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_distribution_batch_updated` ON `distribution_batches` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_distribution_job_tenant` ON `distribution_jobs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_distribution_job_batch` ON `distribution_jobs` (`batch_id`);--> statement-breakpoint
CREATE INDEX `idx_distribution_job_status` ON `distribution_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_wechat_store_tenant` ON `wechat_stores` (`tenant_id`);