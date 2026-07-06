ALTER TABLE `quotations` ADD `accountId` int;--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `accountId` int;--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `accountName` varchar(200);