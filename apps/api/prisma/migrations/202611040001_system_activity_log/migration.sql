ALTER TABLE sys_operation_log
  ADD COLUMN source VARCHAR(191) NOT NULL DEFAULT 'USER',
  ADD COLUMN level VARCHAR(191) NOT NULL DEFAULT 'INFO',
  ADD COLUMN status VARCHAR(191) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN object_id VARCHAR(191) NULL,
  ADD COLUMN object_name VARCHAR(500) NULL,
  ADD COLUMN related_id VARCHAR(191) NULL;
CREATE INDEX sys_operation_log_domain_end_time_id_idx ON sys_operation_log (domain, end_time, id);
CREATE INDEX sys_operation_log_domain_source_level_end_time_idx ON sys_operation_log (domain, source, level, end_time);

-- 系统执行在数据库事务内留痕，涵盖创建、成功、失败、过期和取消，删除业务对象后仍保留。
CREATE TRIGGER adjustment_audit_insert AFTER INSERT ON adjustment_record FOR EACH ROW
INSERT INTO sys_operation_log (
  id, user_id, username, domain, module_name, description, request_id, method, url, ip,
  params, body, response, start_time, end_time, duration, source, level, status, object_id, object_name, related_id
) VALUES (
  UUID(), 'system:strategy', '策略引擎', 'built-in', '策略执行',
  CASE NEW.action WHEN 'SET_POLLING_MEMBER_WEIGHTS' THEN '自动调整成员权重'
    WHEN 'SET_CHANNEL_STATUS' THEN '自动调整通道状态' WHEN 'ADD_POLLING_MEMBER' THEN '自动添加备用通道'
    WHEN 'REMOVE_POLLING_MEMBER' THEN '自动移除轮询成员' ELSE NEW.action END,
  NEW.idempotency_key, 'SYSTEM', CONCAT('/adjustments/', NEW.id), '',
  JSON_OBJECT('siteId', NEW.site_id, 'strategyGroupId', NEW.strategy_group_id, 'ruleName', NEW.rule_name, 'target', NEW.target),
  JSON_OBJECT('beforeState', NEW.before_state, 'desiredState', JSON_EXTRACT(NEW.desired_state, '$.command.desiredState')),
  JSON_OBJECT('actualState', NEW.actual_state, 'reason', NEW.failure_reason),
  NEW.created_at, COALESCE(NEW.completed_at, NEW.created_at), 0, 'SYSTEM',
  CASE WHEN NEW.status = 'FAILED' THEN 'ERROR' WHEN NEW.status IN ('SKIPPED','EXPIRED') THEN 'WARN' ELSE 'INFO' END,
  NEW.status, NEW.site_id,
  CONCAT(COALESCE((SELECT name FROM epay_site WHERE id = NEW.site_id), NEW.site_id), ' / ',
    COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(NEW.desired_state, '$.groupName')), 'null'), NEW.strategy_group_id, '旧策略')),
  NEW.id
);
CREATE TRIGGER adjustment_audit_update AFTER UPDATE ON adjustment_record FOR EACH ROW
INSERT INTO sys_operation_log (
  id, user_id, username, domain, module_name, description, request_id, method, url, ip,
  params, body, response, start_time, end_time, duration, source, level, status, object_id, object_name, related_id
)
SELECT UUID(), 'system:strategy', '策略引擎', 'built-in', '策略执行',
  CASE NEW.action WHEN 'SET_POLLING_MEMBER_WEIGHTS' THEN '自动调整成员权重'
    WHEN 'SET_CHANNEL_STATUS' THEN '自动调整通道状态' WHEN 'ADD_POLLING_MEMBER' THEN '自动添加备用通道'
    WHEN 'REMOVE_POLLING_MEMBER' THEN '自动移除轮询成员' ELSE NEW.action END,
  NEW.idempotency_key, 'SYSTEM', CONCAT('/adjustments/', NEW.id), '',
  JSON_OBJECT('siteId', NEW.site_id, 'strategyGroupId', NEW.strategy_group_id, 'ruleName', NEW.rule_name, 'target', NEW.target),
  JSON_OBJECT('beforeState', NEW.before_state, 'desiredState', JSON_EXTRACT(NEW.desired_state, '$.command.desiredState')),
  JSON_OBJECT('actualState', NEW.actual_state, 'reason', NEW.failure_reason),
  NEW.created_at, COALESCE(NEW.completed_at, CURRENT_TIMESTAMP(3)), 0, 'SYSTEM',
  CASE WHEN NEW.status = 'FAILED' THEN 'ERROR' WHEN NEW.status IN ('SKIPPED','EXPIRED') THEN 'WARN' ELSE 'INFO' END,
  NEW.status, NEW.site_id,
  CONCAT(COALESCE((SELECT name FROM epay_site WHERE id = NEW.site_id), NEW.site_id), ' / ',
    COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(NEW.desired_state, '$.groupName')), 'null'), NEW.strategy_group_id, '旧策略')),
  NEW.id
WHERE NOT (OLD.status <=> NEW.status) OR NOT (OLD.actual_state <=> NEW.actual_state);

-- 历史调整仅按当前状态回填，不虚构曾经发生的状态转换。
INSERT INTO sys_operation_log (
  id, user_id, username, domain, module_name, description, request_id, method, url, ip,
  params, body, response, start_time, end_time, duration, source, level, status, object_id, object_name, related_id
)
SELECT UUID(), 'system:strategy', '策略引擎', 'built-in', '策略执行',
  CASE a.action WHEN 'SET_POLLING_MEMBER_WEIGHTS' THEN '自动调整成员权重'
    WHEN 'SET_CHANNEL_STATUS' THEN '自动调整通道状态' WHEN 'ADD_POLLING_MEMBER' THEN '自动添加备用通道'
    WHEN 'REMOVE_POLLING_MEMBER' THEN '自动移除轮询成员' ELSE a.action END,
  a.idempotency_key, 'SYSTEM', CONCAT('/adjustments/', a.id), '',
  JSON_OBJECT('siteId', a.site_id, 'strategyGroupId', a.strategy_group_id, 'ruleName', a.rule_name, 'target', a.target, 'historical', true),
  JSON_OBJECT('beforeState', a.before_state, 'desiredState', JSON_EXTRACT(a.desired_state, '$.command.desiredState')),
  JSON_OBJECT('actualState', a.actual_state, 'reason', a.failure_reason),
  a.created_at, COALESCE(a.completed_at, a.created_at), 0, 'SYSTEM',
  CASE WHEN a.status = 'FAILED' THEN 'ERROR' WHEN a.status IN ('SKIPPED','EXPIRED') THEN 'WARN' ELSE 'INFO' END,
  a.status, a.site_id,
  CONCAT(s.name, ' / ', COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(a.desired_state, '$.groupName')), 'null'), a.strategy_group_id, '旧策略')), a.id
FROM adjustment_record a JOIN epay_site s ON s.id = a.site_id;

-- 保留既有菜单授权，将运行监控的执行入口升级为系统日志。
UPDATE sys_menu SET menu_name = '系统日志', icon = 'tabler:logs', updated_at = CURRENT_TIMESTAMP(3)
WHERE route_name = 'runtime-monitor_executions';
