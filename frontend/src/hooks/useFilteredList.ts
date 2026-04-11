import { useMemo } from "react";

export function useFilteredList<T>(props: {
  items: T[];
  query: string;
  matchesQuery: (item: T, query: string) => boolean;
  filter?: (item: T) => boolean;
  sort?: (a: T, b: T) => number;
}) {
  const { filter, items, matchesQuery, query, sort } = props;

  return useMemo(() => {
    let result = items.filter((item) => matchesQuery(item, query));

    if (filter) {
      result = result.filter(filter);
    }

    if (sort) {
      result = [...result].sort(sort);
    }

    return result;
  }, [filter, items, matchesQuery, query, sort]);
}
