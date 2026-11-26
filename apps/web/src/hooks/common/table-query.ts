import { shallowRef, toValue } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import { jsonClone } from '@sa/utils';

/** 输入草稿只有主动查询时才应用，轮询及翻页继续使用已提交条件。 */
export function useTableQuery<T>(draft: MaybeRefOrGetter<T>) {
  const query = shallowRef<T>(jsonClone(toValue(draft)));
  function applyQuery() {
    query.value = jsonClone(toValue(draft));
  }
  return { query, applyQuery };
}
