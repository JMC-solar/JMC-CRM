CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`industry` varchar(100),
	`phone` varchar(50),
	`email` varchar(320),
	`website` varchar(500),
	`address` text,
	`city` varchar(100),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('call','email','meeting','site_visit','follow_up','note') NOT NULL,
	`subject` varchar(300) NOT NULL,
	`description` text,
	`contactId` int,
	`opportunityId` int,
	`leadId` int,
	`scheduledAt` timestamp,
	`completedAt` timestamp,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(100) NOT NULL,
	`entity` varchar(100) NOT NULL,
	`entityId` int,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bom_package_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`packageId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bom_package_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bom_packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(300) NOT NULL,
	`description` text,
	`systemSize` varchar(50),
	`systemType` varchar(100),
	`totalCost` decimal(12,2),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bom_packages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100),
	`email` varchar(320),
	`phone` varchar(50),
	`company` varchar(200),
	`position` varchar(100),
	`address` text,
	`city` varchar(100),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sku` varchar(100) NOT NULL,
	`name` varchar(300) NOT NULL,
	`description` text,
	`category` enum('panels','inverters','batteries','accessories','mounting','cabling','breakers') NOT NULL,
	`brand` varchar(100),
	`model` varchar(100),
	`specs` text,
	`unit` varchar(50) DEFAULT 'pcs',
	`purchasePrice` decimal(12,2),
	`sellingPrice` decimal(12,2),
	`stockOnHand` int NOT NULL DEFAULT 0,
	`stockReserved` int NOT NULL DEFAULT 0,
	`reorderLevel` int DEFAULT 5,
	`warehouseLocation` varchar(100),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_items_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100),
	`email` varchar(320),
	`phone` varchar(50),
	`company` varchar(200),
	`source` varchar(100),
	`status` enum('new','contacted','qualified','proposal','won','lost') NOT NULL DEFAULT 'new',
	`systemSize` varchar(50),
	`estimatedValue` decimal(12,2),
	`notes` text,
	`contactId` int,
	`accountId` int,
	`assignedTo` int,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(300) NOT NULL,
	`status` enum('new','contacted','qualified','proposal','won','lost') NOT NULL DEFAULT 'new',
	`value` decimal(12,2),
	`systemSize` varchar(50),
	`systemType` varchar(100),
	`contactId` int,
	`accountId` int,
	`leadId` int,
	`assignedTo` int,
	`expectedCloseDate` timestamp,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `opportunities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseOrderId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` decimal(12,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poNumber` varchar(50) NOT NULL,
	`supplier` varchar(200) NOT NULL,
	`status` enum('draft','sent','received','cancelled') NOT NULL DEFAULT 'draft',
	`totalAmount` decimal(12,2),
	`notes` text,
	`orderedAt` timestamp,
	`receivedAt` timestamp,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_orders_poNumber_unique` UNIQUE(`poNumber`)
);
--> statement-breakpoint
CREATE TABLE `quotation_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quotationId` int NOT NULL,
	`itemId` int,
	`description` varchar(500) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` decimal(12,2) NOT NULL,
	`totalPrice` decimal(12,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quotation_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteNumber` varchar(50) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`title` varchar(300) NOT NULL,
	`status` enum('draft','pending_approval','approved','sent','accepted','rejected','expired') NOT NULL DEFAULT 'draft',
	`opportunityId` int,
	`contactId` int,
	`customerName` varchar(200),
	`customerEmail` varchar(320),
	`customerPhone` varchar(50),
	`customerAddress` text,
	`subtotal` decimal(12,2),
	`discountPercent` decimal(5,2),
	`discountAmount` decimal(12,2),
	`taxPercent` decimal(5,2),
	`taxAmount` decimal(12,2),
	`totalAmount` decimal(12,2),
	`laborCost` decimal(12,2),
	`installationFee` decimal(12,2),
	`paymentTerms` text,
	`warrantyTerms` text,
	`validUntil` timestamp,
	`notes` text,
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotations_id` PRIMARY KEY(`id`),
	CONSTRAINT `quotations_quoteNumber_unique` UNIQUE(`quoteNumber`)
);
--> statement-breakpoint
CREATE TABLE `stock_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`type` enum('stock_in','stock_out','adjustment','reserved','unreserved') NOT NULL,
	`quantity` int NOT NULL,
	`reference` varchar(200),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','subadmin') NOT NULL DEFAULT 'subadmin';