CREATE TABLE `agent_saturday_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` integer NOT NULL,
	`month` text NOT NULL,
	`saturday_group` text,
	`saturday_horario` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_month_unique_idx` ON `agent_saturday_groups` (`agent_id`,`month`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`username` text,
	`avatar_initials` text,
	`notes` text,
	`location` text DEFAULT 'Monte Grande' NOT NULL,
	`horario_default` text DEFAULT '' NOT NULL,
	`esquema_semanal` text,
	`esquema_horario` text,
	`esquema_break_inicio` text,
	`esquema_break_fin` text,
	`max_consecutive_ho` integer,
	`min_p_week` integer,
	`last_autogestion_assigned_at` integer,
	`estado_excepcional` text,
	`estado_excepcional_motivo` text,
	`estado_excepcional_at` integer,
	`estado_excepcional_minutos` integer,
	`saturday_group` text,
	`saturday_horario` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_name_unique` ON `agents` (`name`);--> statement-breakpoint
CREATE TABLE `application_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`category_id` text,
	`description` text,
	`version` text,
	`file_path` text,
	`icon_path` text,
	FOREIGN KEY (`category_id`) REFERENCES `application_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`action` text NOT NULL,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_parameters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`category` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_parameters_code_unique` ON `audit_parameters` (`code`);--> statement-breakpoint
CREATE TABLE `audit_scores` (
	`audit_id` integer NOT NULL,
	`parameter_id` integer NOT NULL,
	`score` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`audit_id`, `parameter_id`),
	FOREIGN KEY (`audit_id`) REFERENCES `quality_audits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parameter_id`) REFERENCES `audit_parameters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
CREATE TABLE `holidays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holidays_date_unique` ON `holidays` (`date`);--> statement-breakpoint
CREATE TABLE `monthly_guardia_pasiva_operator` (
	`month` text PRIMARY KEY NOT NULL,
	`operator_id` integer NOT NULL,
	FOREIGN KEY (`operator_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `monthly_summaries` (
	`agent_id` integer NOT NULL,
	`month` text NOT NULL,
	`summary` text NOT NULL,
	PRIMARY KEY(`agent_id`, `month`),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
	`street` text,
	`number` text,
	`locality` text,
	`county` text,
	`zone` text,
	`officeType` text,
	`categoryClass` text,
	`rubric` text,
	`parentNis` text,
	`phone` text,
	`manager` text,
	`regionId` text,
	`enRed` integer DEFAULT false,
	`paqarAdmision` integer DEFAULT false,
	`paqarEntrega` integer DEFAULT false,
	`searchable_text` text,
	FOREIGN KEY (`provinceCode`) REFERENCES `provinces`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offices_code_unique` ON `offices` (`code`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `offices` (`name`);--> statement-breakpoint
CREATE INDEX `locality_idx` ON `offices` (`locality`);--> statement-breakpoint
CREATE INDEX `province_idx` ON `offices` (`provinceCode`);--> statement-breakpoint
CREATE INDEX `type_idx` ON `offices` (`type`);--> statement-breakpoint
CREATE TABLE `operator_attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` integer NOT NULL,
	`date` text NOT NULL,
	`asistencia` text,
	`ausencia` text,
	`entrada_real` text,
	`salida_real` text,
	`cumplimiento` text,
	`cumplimiento_forzado` integer DEFAULT false,
	`motivo_loguin` text,
	`detalle` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `operator_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operator_id` text NOT NULL,
	`day_of_week` text NOT NULL,
	`modality` text NOT NULL,
	`shift_start` text,
	`shift_end` text,
	`break_time` text,
	FOREIGN KEY (`operator_id`) REFERENCES `operators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `operator_shifts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operator_id` text NOT NULL,
	`type` text NOT NULL,
	`shift_start` text NOT NULL,
	`shift_end` text NOT NULL,
	`break_time` text NOT NULL,
	FOREIGN KEY (`operator_id`) REFERENCES `operators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `operators` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'disponible' NOT NULL,
	`location_id` text,
	`current_mode` text DEFAULT 'presencial' NOT NULL,
	`last_autogestion_assigned_at` integer,
	FOREIGN KEY (`location_id`) REFERENCES `work_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
CREATE TABLE `quality_audits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` integer NOT NULL,
	`call_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`duration` text NOT NULL,
	`date` text NOT NULL,
	`month` text NOT NULL,
	`total_score` integer NOT NULL,
	`section1_score` integer NOT NULL,
	`section2_score` integer NOT NULL,
	`notes` text,
	`is_critical_failure` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
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
	`icon_path` text,
	`sortOrder` integer DEFAULT 0,
	`deprecated` integer DEFAULT false,
	FOREIGN KEY (`category_id`) REFERENCES `resource_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `saturday_rotation_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`rotation_order` text DEFAULT 'A,B,C,D' NOT NULL,
	`start_date` text DEFAULT '2026-06-06' NOT NULL,
	`start_group` text DEFAULT 'A' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saturday_rotation_config_month_unique` ON `saturday_rotation_config` (`month`);--> statement-breakpoint
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
	`break_fin` text,
	`is_override` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `support_guides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`help_desk_name` text NOT NULL,
	`legacy_name` text,
	`invgate_name` text,
	`route` text,
	`topics` text,
	`contacts` text,
	`referents` text,
	`notes` text,
	`searchable_text` text
);
--> statement-breakpoint
CREATE TABLE `terminals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hostname` text NOT NULL,
	`mac_address` text,
	`ip_address` text,
	`operating_system` text,
	`os_architecture` text,
	`ram` text,
	`serial_number` text,
	`manufacturer` text,
	`model` text,
	`nis` text,
	`nis2` text,
	`last_contact` text,
	`synced_at` text,
	`searchable_text` text,
	FOREIGN KEY (`nis`) REFERENCES `offices`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terminals_hostname_unique` ON `terminals` (`hostname`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`role` text DEFAULT 'agent' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `weekend_overtime_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`weekend_start_date` text NOT NULL,
	`referente` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekend_overtime_config_weekend_start_date_unique` ON `weekend_overtime_config` (`weekend_start_date`);--> statement-breakpoint
CREATE TABLE `weekend_overtime_shifts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`weekend_start_date` text NOT NULL,
	`agent_id` integer NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `overtime_shifts_weekend_start_idx` ON `weekend_overtime_shifts` (`weekend_start_date`);--> statement-breakpoint
CREATE INDEX `overtime_shifts_agent_idx` ON `weekend_overtime_shifts` (`agent_id`);--> statement-breakpoint
CREATE TABLE `weekly_guardia_pasiva_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`supervisor_name` text NOT NULL,
	`referente_id` integer NOT NULL,
	FOREIGN KEY (`referente_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_guardia_pasiva_assignments_start_date_unique` ON `weekly_guardia_pasiva_assignments` (`start_date`);--> statement-breakpoint
CREATE TABLE `work_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
