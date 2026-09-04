CREATE TABLE `sweep_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`sweep_id` text NOT NULL,
	`kind` text NOT NULL,
	`page_url` text,
	`page_pattern` text,
	`element_selector` text,
	`element_label` text,
	`event_name` text,
	`field_diffs` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sweep_id`) REFERENCES `sweeps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sweeps` (
	`id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_message` text,
	`page_source` text,
	`total_urls_discovered` integer,
	`bucket_count` integer,
	`pages_swept_count` integer DEFAULT 0 NOT NULL,
	`elements_swept_count` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL
);
