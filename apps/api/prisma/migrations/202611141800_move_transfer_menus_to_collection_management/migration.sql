UPDATE sys_menu AS transfer_menu
JOIN sys_menu AS collection_menu ON collection_menu.route_name = 'account-management'
SET transfer_menu.pid = collection_menu.id,
    transfer_menu.sequence = CASE transfer_menu.route_name
      WHEN 'fund-management_payment-requests' THEN 5
      WHEN 'fund-management_transfer-strategies' THEN 6
    END
WHERE transfer_menu.route_name IN (
  'fund-management_payment-requests',
  'fund-management_transfer-strategies'
);
