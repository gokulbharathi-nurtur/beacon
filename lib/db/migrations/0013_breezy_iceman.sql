ALTER TABLE `runs` ADD `kind` text DEFAULT 'pageload' NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `steps` text;--> statement-breakpoint
ALTER TABLE `runs` ADD `step_results` text;--> statement-breakpoint
ALTER TABLE `templates` ADD `kind` text DEFAULT 'pageload' NOT NULL;--> statement-breakpoint
ALTER TABLE `templates` ADD `steps` text;