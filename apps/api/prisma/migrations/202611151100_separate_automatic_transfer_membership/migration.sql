-- 列表归属独立于执行开关；现有已开启账号继续保留并按原状态运行。
ALTER TABLE account ADD transfer_listed BOOLEAN NOT NULL DEFAULT false;
UPDATE account SET transfer_listed = true WHERE transfer_enabled = true;
