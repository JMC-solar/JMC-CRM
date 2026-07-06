CREATE TABLE `project_status_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`fromStage` varchar(50),
	`toStage` varchar(50) NOT NULL,
	`notes` text,
	`changedBy` int,
	`changedByName` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(300) NOT NULL,
	`description` text,
	`sizeOfSetup` varchar(100),
	`typeOfSetup` varchar(100),
	`customerName` varchar(200),
	`address` text,
	`stage` enum('procurement','implementation','ongoing','completed') NOT NULL DEFAULT 'procurement',
	`startDate` timestamp,
	`targetCompletionDate` timestamp,
	`completedDate` timestamp,
	`opportunityId` int,
	`quotationId` int,
	`contactId` int,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
