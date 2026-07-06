CREATE TABLE `config_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(100) NOT NULL,
	`value` varchar(200) NOT NULL,
	`sortOrder` int DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `config_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`code` varchar(50),
	`contactPerson` varchar(200),
	`phone` varchar(50),
	`email` varchar(320),
	`address` text,
	`city` varchar(100),
	`paymentTerms` varchar(200),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `supplierId` int;--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `purpose` varchar(100);--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `purposeRefId` int;--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `purposeRefName` varchar(200);