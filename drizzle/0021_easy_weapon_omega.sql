CREATE TABLE `item_price_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`priceType` enum('purchase','selling') NOT NULL,
	`oldPrice` decimal(12,2),
	`newPrice` decimal(12,2),
	`changedBy` int,
	`changedByName` varchar(200),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `item_price_history_id` PRIMARY KEY(`id`)
);
