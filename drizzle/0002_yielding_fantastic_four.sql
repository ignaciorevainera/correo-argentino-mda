PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- 1. Mapear application_categories
CREATE TABLE `_map_application_categories` AS 
SELECT id AS old_id, ROW_NUMBER() OVER (ORDER BY id) AS new_id 
FROM application_categories;--> statement-breakpoint

CREATE TABLE `__new_application_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL
);--> statement-breakpoint

INSERT INTO `__new_application_categories`("id", "title") 
SELECT m.new_id, a.title 
FROM application_categories a
JOIN _map_application_categories m ON a.id = m.old_id;--> statement-breakpoint

DROP TABLE `application_categories`;--> statement-breakpoint
ALTER TABLE `__new_application_categories` RENAME TO `application_categories`;--> statement-breakpoint

-- 2. Migrar applications remapeando category_id
CREATE TABLE `__new_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`category_id` integer,
	`description` text,
	`version` text,
	`file_path` text,
	`icon_path` text,
	`sortOrder` integer DEFAULT 0,
	FOREIGN KEY (`category_id`) REFERENCES `application_categories`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint

INSERT INTO `__new_applications`("id", "title", "category_id", "description", "version", "file_path", "icon_path", "sortOrder") 
SELECT ap.id, ap.title, m.new_id, ap.description, ap.version, ap.file_path, ap.icon_path, ap.sortOrder
FROM applications ap
LEFT JOIN _map_application_categories m ON ap.category_id = m.old_id;--> statement-breakpoint

DROP TABLE `applications`;--> statement-breakpoint
ALTER TABLE `__new_applications` RENAME TO `applications`;--> statement-breakpoint
DROP TABLE `_map_application_categories`;--> statement-breakpoint

-- 3. Mapear contact_categories
CREATE TABLE `_map_contact_categories` AS 
SELECT id AS old_id, ROW_NUMBER() OVER (ORDER BY id) AS new_id 
FROM contact_categories;--> statement-breakpoint

CREATE TABLE `__new_contact_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`icon` text NOT NULL,
	`tone` text NOT NULL
);--> statement-breakpoint

INSERT INTO `__new_contact_categories`("id", "title", "icon", "tone") 
SELECT m.new_id, c.title, c.icon, c.tone 
FROM contact_categories c
JOIN _map_contact_categories m ON c.id = m.old_id;--> statement-breakpoint

DROP TABLE `contact_categories`;--> statement-breakpoint
ALTER TABLE `__new_contact_categories` RENAME TO `contact_categories`;--> statement-breakpoint

-- 4. Migrar provider_contacts remapeando category_id
CREATE TABLE `__new_provider_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer,
	`provider` text NOT NULL,
	`service` text NOT NULL,
	`phones` text,
	`emails` text,
	`urls` text,
	`sortOrder` integer DEFAULT 0,
	FOREIGN KEY (`category_id`) REFERENCES `contact_categories`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint

INSERT INTO `__new_provider_contacts`("id", "category_id", "provider", "service", "phones", "emails", "urls", "sortOrder") 
SELECT p.id, m.new_id, p.provider, p.service, p.phones, p.emails, p.urls, p.sortOrder
FROM provider_contacts p
LEFT JOIN _map_contact_categories m ON p.category_id = m.old_id;--> statement-breakpoint

DROP TABLE `provider_contacts`;--> statement-breakpoint
ALTER TABLE `__new_provider_contacts` RENAME TO `provider_contacts`;--> statement-breakpoint
DROP TABLE `_map_contact_categories`;--> statement-breakpoint

-- 5. Mapear resource_categories y resource_links (ambos ids cambian a enteros)
CREATE TABLE `_map_resource_categories` AS 
SELECT id AS old_id, ROW_NUMBER() OVER (ORDER BY id) AS new_id 
FROM resource_categories;--> statement-breakpoint

CREATE TABLE `_map_resource_links` AS 
SELECT id AS old_id, ROW_NUMBER() OVER (ORDER BY id) AS new_id 
FROM resource_links;--> statement-breakpoint

CREATE TABLE `__new_resource_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`iconName` text NOT NULL,
	`tone` text DEFAULT 'primary' NOT NULL
);--> statement-breakpoint

INSERT INTO `__new_resource_categories`("id", "title", "iconName", "tone") 
SELECT m.new_id, r.title, r.iconName, r.tone 
FROM resource_categories r
JOIN _map_resource_categories m ON r.id = m.old_id;--> statement-breakpoint

DROP TABLE `resource_categories`;--> statement-breakpoint
ALTER TABLE `__new_resource_categories` RENAME TO `resource_categories`;--> statement-breakpoint

-- 6. Migrar resource_links remapeando category_id y su propio id
CREATE TABLE `__new_resource_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`subtitle` text,
	`icon_path` text,
	`sortOrder` integer DEFAULT 0,
	`deprecated` integer DEFAULT false,
	FOREIGN KEY (`category_id`) REFERENCES `resource_categories`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

INSERT INTO `__new_resource_links`("id", "category_id", "title", "url", "subtitle", "icon_path", "sortOrder", "deprecated") 
SELECT ml.new_id, mc.new_id, rl.title, rl.url, rl.subtitle, rl.icon_path, rl.sortOrder, rl.deprecated
FROM resource_links rl
LEFT JOIN _map_resource_categories mc ON rl.category_id = mc.old_id
LEFT JOIN _map_resource_links ml ON rl.id = ml.old_id;--> statement-breakpoint

DROP TABLE `resource_links`;--> statement-breakpoint
ALTER TABLE `__new_resource_links` RENAME TO `resource_links`;--> statement-breakpoint
DROP TABLE `_map_resource_categories`;--> statement-breakpoint
DROP TABLE `_map_resource_links`;--> statement-breakpoint

PRAGMA foreign_keys=ON;