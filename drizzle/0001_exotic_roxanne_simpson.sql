ALTER TABLE `applications` ADD `sortOrder` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `provider_contacts` ADD `sortOrder` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `regions` ADD `color` text;