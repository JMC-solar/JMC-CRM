CREATE TABLE `project_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`paymentDate` timestamp NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`paymentMethod` varchar(100),
	`paymentReference` varchar(200),
	`notes` text,
	`createdBy` int,
	`createdByName` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `totalProjectAmount` decimal(12,2);