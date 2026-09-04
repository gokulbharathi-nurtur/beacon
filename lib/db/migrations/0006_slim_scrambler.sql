CREATE TABLE `content_check_results` (
	`id` text PRIMARY KEY NOT NULL,
	`content_check_id` text NOT NULL,
	`page_url` text NOT NULL,
	`matched_pattern` text,
	`status` text NOT NULL,
	`expected` text,
	`actual` text,
	`field_diffs` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`content_check_id`) REFERENCES `content_checks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`content_map_id` text NOT NULL,
	`base_url` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_message` text,
	`page_source` text,
	`total_urls_discovered` integer,
	`pages_checked_count` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`content_map_id`) REFERENCES `content_maps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content_map_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`content_map_id` text NOT NULL,
	`row_order` integer NOT NULL,
	`raw_pages_text` text NOT NULL,
	`patterns` text NOT NULL,
	`content_group` text,
	`content_id` text,
	`content_type` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`content_map_id`) REFERENCES `content_maps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_filename` text,
	`created_at` integer NOT NULL
);
