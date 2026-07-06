CREATE TABLE `inventory_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`itemName` varchar(300),
	`itemSku` varchar(100),
	`transactionType` enum('stock_in','stock_out','transfer_in','transfer_out','adjustment','initial') NOT NULL,
	`quantity` int NOT NULL,
	`previousStock` int NOT NULL,
	`newStock` int NOT NULL,
	`sourceLocation` varchar(100),
	`destinationLocation` varchar(100),
	`reference` varchar(200),
	`purpose` varchar(200),
	`notes` text,
	`performedBy` int,
	`performedByName` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`previousQuantity` int NOT NULL,
	`newQuantity` int NOT NULL,
	`adjustmentQuantity` int NOT NULL,
	`reason` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`requestedBy` int,
	`requestedByName` varchar(200),
	`approvedBy` int,
	`approvedByName` varchar(200),
	`approvedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_adjustments_id` PRIMARY KEY(`id`)
);
