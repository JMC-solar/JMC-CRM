ALTER TABLE `purchase_orders` ADD `vatEnabled` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `vatRate` decimal(5,2) DEFAULT '12';--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `discountType` enum('none','percentage','fixed') DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `discountValue` decimal(12,2) DEFAULT '0';