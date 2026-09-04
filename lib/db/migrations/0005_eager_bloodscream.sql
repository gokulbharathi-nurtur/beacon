ALTER TABLE `runs` ADD `form_selector` text;--> statement-breakpoint
ALTER TABLE `runs` ADD `form_allow_submit` integer DEFAULT false NOT NULL;