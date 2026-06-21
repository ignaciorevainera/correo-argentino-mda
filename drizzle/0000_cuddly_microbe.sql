CREATE TABLE `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`avatar_initials` text,
	`notes` text,
	`horario_default` text DEFAULT '08:00 - 17:00' NOT NULL,
	`esquema_semanal` text,
	`esquema_horario` text,
	`esquema_break_inicio` text,
	`esquema_break_fin` text,
	`workplace` text DEFAULT 'Monte Grande' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_name_unique` ON `agents` (`name`);--> statement-breakpoint
CREATE TABLE `contact_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`icon` text NOT NULL,
	`tone` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text
);
--> statement-breakpoint
CREATE TABLE `cubic_assignments` (
	`cubic_id` integer NOT NULL,
	`agent_id` integer NOT NULL,
	`shift` text NOT NULL,
	PRIMARY KEY(`cubic_id`, `agent_id`, `shift`),
	FOREIGN KEY (`cubic_id`) REFERENCES `cubics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cubics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`ip` text,
	`status` text DEFAULT 'offline' NOT NULL,
	`last_ping` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cubics_name_unique` ON `cubics` (`name`);--> statement-breakpoint
CREATE TABLE `office_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`office_id` integer NOT NULL,
	`type` text NOT NULL,
	`hostname` text,
	`ip` text,
	FOREIGN KEY (`office_id`) REFERENCES `offices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `office_contacts` (
	`office_id` integer NOT NULL,
	`contact_id` integer NOT NULL,
	`role` text,
	`time_slot` text,
	PRIMARY KEY(`office_id`, `contact_id`),
	FOREIGN KEY (`office_id`) REFERENCES `offices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `offices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`provinceCode` text NOT NULL,
	`address` text,
	`lat` real,
	`lng` real,
	`email` text,
	`notes` text,
	FOREIGN KEY (`provinceCode`) REFERENCES `provinces`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offices_code_unique` ON `offices` (`code`);--> statement-breakpoint
CREATE TABLE `provider_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` text,
	`provider` text NOT NULL,
	`service` text NOT NULL,
	`phones` text,
	`emails` text,
	`urls` text,
	FOREIGN KEY (`category_id`) REFERENCES `contact_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `provinces` (
	`code` text(1) PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`regionId` text,
	FOREIGN KEY (`regionId`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `regions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resource_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`iconName` text NOT NULL,
	`tone` text DEFAULT 'primary' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resource_links` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`subtitle` text,
	FOREIGN KEY (`category_id`) REFERENCES `resource_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_name` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`comment` text,
	`horario` text,
	`entrada_real` text,
	`salida_real` text,
	`break_inicio` text,
	`break_fin` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`role` text DEFAULT 'agent' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);