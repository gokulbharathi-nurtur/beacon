DROP TABLE `sweep_findings`;--> statement-breakpoint
DROP TABLE `sweeps`;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `click_selector`;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `click_label`;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `click_href`;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `click_target_label`;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `click_target_href`;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `click_target_resolved_count`;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `form_selector`;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `form_allow_submit`;--> statement-breakpoint
ALTER TABLE `templates` DROP COLUMN `category`;--> statement-breakpoint
ALTER TABLE `templates` DROP COLUMN `click_selector`;--> statement-breakpoint
ALTER TABLE `templates` DROP COLUMN `click_label`;--> statement-breakpoint
ALTER TABLE `templates` DROP COLUMN `click_href`;