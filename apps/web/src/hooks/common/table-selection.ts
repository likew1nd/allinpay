import { shallowRef, watch } from 'vue';
import type { Ref } from 'vue';
import type { TableInstance } from 'element-plus';

/** 配合稳定 row-key 和 reserve-selection，勾选只保留在当前结果集中。 */
export function useTableSelection<Row extends object, Key extends keyof Row>(
  data: Ref<Row[]>,
  idKey: Key,
  checkedRowKeys: Ref<Row[Key][]> = shallowRef<Row[Key][]>([])
) {
  const tableRef = shallowRef<TableInstance>();
  const selectedRows = shallowRef<Row[]>([]);
  let restoring = false;

  function handleSelectionChange(rows: Row[]) {
    if (restoring) return;
    selectedRows.value = rows;
    const keys = rows.map(row => row[idKey]);
    if (keys.length !== checkedRowKeys.value.length || keys.some((key, index) => key !== checkedRowKeys.value[index])) {
      checkedRowKeys.value = keys;
    }
  }

  function restoreSelection() {
    const table = tableRef.value;
    if (!table) return;
    const wanted = new Set(checkedRowKeys.value);
    const rows: Row[] = [];
    function collect(items: Row[]) {
      for (const row of items) {
        if (wanted.has(row[idKey])) rows.push(row);
        const children = (row as Row & { children?: Row[] }).children;
        if (children?.length) collect(children);
      }
    }
    collect(data.value);
    const current = table.getSelectionRows() as Row[];
    if (current.length !== rows.length || current.some((row, index) => row !== rows[index])) {
      restoring = true;
      try {
        // 恢复已有勾选时忽略临时交互禁用，并同步为最新行对象。
        table.clearSelection();
        rows.forEach(row => table.toggleRowSelection(row, true, true));
      } finally {
        restoring = false;
      }
    }
    handleSelectionChange(table.getSelectionRows() as Row[]);
  }

  watch([data, checkedRowKeys, tableRef], restoreSelection, { flush: 'post' });

  return { tableRef, checkedRowKeys, selectedRows, handleSelectionChange };
}
