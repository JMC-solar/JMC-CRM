CREATE TABLE `supplier_item_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`inventoryItemId` int NOT NULL,
	`unitPrice` decimal(12,2) NOT NULL,
	`lastPurchaseOrderId` int,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_item_prices_id` PRIMARY KEY(`id`)
);
