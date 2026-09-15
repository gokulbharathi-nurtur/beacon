CREATE TABLE `project_hostnames` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`hostname` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_hostnames_hostname_unique` ON `project_hostnames` (`hostname`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `content_checks` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
ALTER TABLE `content_maps` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
ALTER TABLE `runs` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
ALTER TABLE `templates` ADD `project_id` text REFERENCES projects(id);