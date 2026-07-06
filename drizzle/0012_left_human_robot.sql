CREATE TABLE `acknowledgement_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('quotation','project_payment','net_metering_payment') NOT NULL,
	`referenceId` int NOT NULL,
	`receiptNumber` varchar(50) NOT NULL,
	`customerName` varchar(200),
	`projectReference` varchar(300),
	`amount` decimal(12,2),
	`paymentDate` timestamp,
	`paymentMethod` varchar(100),
	`paymentReference` varchar(200),
	`notes` text,
	`createdBy` int,
	`createdByName` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `acknowledgement_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `acknowledgement_receipts_receiptNumber_unique` UNIQUE(`receiptNumber`)
);
--> statement-breakpoint
CREATE TABLE `delivery_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quotationId` int NOT NULL,
	`receiptNumber` varchar(50) NOT NULL,
	`deliveryDate` timestamp NOT NULL,
	`customerName` varchar(200),
	`customerAddress` text,
	`projectReference` varchar(300),
	`notes` text,
	`createdBy` int,
	`createdByName` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `delivery_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `delivery_receipts_receiptNumber_unique` UNIQUE(`receiptNumber`)
);
--> statement-breakpoint
CREATE TABLE `net_metering_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`netMeteringId` int NOT NULL,
	`paymentDate` timestamp NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`paymentMethod` varchar(100),
	`paymentReference` varchar(200),
	`notes` text,
	`createdBy` int,
	`createdByName` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `net_metering_payments_id` PRIMARY KEY(`id`)
);
