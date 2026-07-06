CREATE TABLE `po_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseOrderId` int NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`paymentDate` timestamp NOT NULL,
	`reference` varchar(200),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `po_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `itemName` varchar(300);--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `itemSku` varchar(100);--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `description` varchar(500);--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `unit` varchar(50);--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `lineTotal` decimal(12,2);--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `receivedQuantity` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `deliveryStatus` enum('not_delivered','partially_delivered','fully_delivered') DEFAULT 'not_delivered' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `paymentStatus` enum('unpaid','partially_paid','paid') DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `paidAmount` decimal(12,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `deliveredAt` timestamp;