import { useEffect, useMemo, useState } from "react";
import type { Category, Service } from "../api/types";
import { ApiRequestError } from "../api/client";
import { errorMessage } from "./errors";
import { fetchAllPages } from "./pagination";

export interface CatalogService extends Service {
  categoryId: string;
  categoryName: string;
}

export function useCatalog() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAllPages<Category>("/categories/")
      .then((rows) => {
        if (active) setCategories(rows);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't load services. Please refresh the page.");
      });
    return () => {
      active = false;
    };
  }, []);

  const services = useMemo<CatalogService[]>(
    () =>
      (categories ?? []).flatMap((category) =>
        category.services.map((service) => ({
          ...service,
          categoryId: category.id,
          categoryName: category.name,
        })),
      ),
    [categories],
  );

  return { categories, services, error, loading: categories === null && !error };
}
