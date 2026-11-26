-- Compound conditions produce longer human-readable rule descriptions.
ALTER TABLE `adjustment_record` MODIFY COLUMN `rule_name` TEXT NULL;
