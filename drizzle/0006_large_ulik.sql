ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','subadmin','purchaser','staff','sales_rep') NOT NULL DEFAULT 'subadmin';--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `mobile` varchar(50);--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('active','inactive') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `createdBy` int;