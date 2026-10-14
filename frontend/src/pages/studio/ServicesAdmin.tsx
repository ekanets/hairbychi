import { useEffect, useState, type FormEvent } from "react";
import { ApiRequestError } from "../../api/client";
import {
  adminCreateCategory,
  adminCreateService,
  adminDeleteCategory,
  adminDeleteService,
  adminUpdateCategory,
  adminUpdateService,
  type AdminService,
} from "../../api/endpoints";
import type { Category } from "../../api/types";
import { errorMessage } from "../../lib/errors";
import { fetchAllPages } from "../../lib/pagination";
import { money as cad } from "../../lib/timezone";
import { Button } from "../../ui/Button";
import { Panel, StudioTitle, inputCls } from "./StudioLayout";

interface CategoryRow {
  id: string;
  name: string;
  display_order: number;
}

export default function ServicesAdmin() {
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [services, setServices] = useState<AdminService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [categoryName, setCategoryName] = useState("");
  const [draft, setDraft] = useState({ category: "", name: "", price: "", sec_price: "", duration_minutes: "", photo_url: "" });

  useEffect(() => {
    let active = true;
    fetchAllPages<Category>("/admin/categories")
      .then((rows) => {
        if (active) setCategories(rows.map((row) => ({ id: row.id, name: row.name, display_order: row.display_order ?? 0 })));
      })
      .catch(() => {
        if (active) setError("Couldn't load categories.");
      });
    fetchAllPages<AdminService>("/admin/services")
      .then((rows) => {
        if (active) setServices(rows);
      })
      .catch(() => {
        if (active) setError("Couldn't load services.");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const addCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    setError(null);
    try {
      await adminCreateCategory({ name: categoryName.trim(), display_order: (categories?.length ?? 0) + 1 });
      setCategoryName("");
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't add that category.");
    }
  };

  const rename = async (row: CategoryRow, name: string) => {
    if (!name.trim() || name.trim() === row.name) return;
    try {
      await adminUpdateCategory(row.id, { name: name.trim() });
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't rename that category.");
    }
  };

  const removeCategory = async (id: string) => {
    if (!window.confirm("Delete this category?")) return;
    try {
      await adminDeleteCategory(id);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't delete that category.");
    }
  };

  const addService = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.category || !draft.name.trim() || !draft.price || !draft.duration_minutes) return;
    setError(null);
    try {
      await adminCreateService({
        category: draft.category,
        name: draft.name.trim(),
        price: Number(draft.price).toFixed(2),
        sec_price: draft.sec_price ? Number(draft.sec_price).toFixed(2) : "0.00",
        duration_minutes: Number(draft.duration_minutes),
        photo_url: draft.photo_url.trim() || null,
        description: null,
      });
      setDraft({ category: "", name: "", price: "", sec_price: "", duration_minutes: "", photo_url: "" });
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't add that service.");
    }
  };

  const savePrice = async (service: AdminService, price: string) => {
    if (!price || Number(price).toFixed(2) === service.price) return;
    try {
      await adminUpdateService(service.id, { price: Number(price).toFixed(2) });
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't update that price.");
    }
  };

  const removeService = async (id: string) => {
    if (!window.confirm("Delete this service? Past bookings keep the price they were booked at.")) return;
    try {
      await adminDeleteService(id);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't delete that service.");
    }
  };

  return (
    <div>
      <StudioTitle title="Services" sub="Names, photos, prices, and durations. Deposits stay on the booking, not on the service." />
      {error ? <p className="mb-4 rounded-2xl bg-error-soft p-4 text-sm text-error">{error}</p> : null}

      <Panel title="Add a category">
        <form onSubmit={addCategory} className="flex flex-wrap gap-3">
          <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Braids" className={`${inputCls} min-w-48 flex-1 font-normal`} />
          <Button type="submit" variant="secondary">Add</Button>
        </form>
      </Panel>

      {!categories || !services ? <p className="mt-6 text-sm text-muted">Loading the menu…</p> : null}
      <div className="mt-4 space-y-4">
        {categories?.map((category) => (
          <Panel key={category.id} title={category.name}>
            <form
              key={category.name}
              className="mb-4 flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void rename(category, String(data.get("name") ?? ""));
              }}
            >
              <input name="name" defaultValue={category.name} className={`${inputCls} min-w-40 flex-1 font-normal`} aria-label="Category name" />
              <Button type="submit" size="sm" variant="secondary">Rename</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => void removeCategory(category.id)}>Delete</Button>
            </form>
            <ul className="space-y-2">
              {services?.filter((service) => service.category === category.id).map((service) => (
                <ServiceRow key={service.id} service={service} onSavePrice={savePrice} onDelete={removeService} />
              ))}
              {services?.filter((service) => service.category === category.id).length === 0 ? (
                <li className="text-sm text-muted">No services in this category.</li>
              ) : null}
            </ul>
          </Panel>
        ))}
      </div>

      <Panel title="Add a service" className="mt-4">
        <form onSubmit={addService} className="grid gap-3 sm:grid-cols-2">
          <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={inputCls} aria-label="Category">
            <option value="">Category</option>
            {categories?.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Service name" className={inputCls} />
          <input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="Price CAD" type="number" min="0" step="0.01" className={inputCls} />
          <input value={draft.sec_price} onChange={(e) => setDraft({ ...draft, sec_price: e.target.value })} placeholder="Second price, optional" type="number" min="0" step="0.01" className={inputCls} />
          <input value={draft.duration_minutes} onChange={(e) => setDraft({ ...draft, duration_minutes: e.target.value })} placeholder="Duration in minutes" type="number" min="1" className={inputCls} />
          <input value={draft.photo_url} onChange={(e) => setDraft({ ...draft, photo_url: e.target.value })} placeholder="Photo URL, optional" className={inputCls} />
          <Button type="submit" className="sm:col-span-2">Add service</Button>
        </form>
      </Panel>
    </div>
  );
}

function ServiceRow({
  service,
  onSavePrice,
  onDelete,
}: {
  service: AdminService;
  onSavePrice: (service: AdminService, price: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [price, setPrice] = useState(service.price);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream px-3 py-2 text-sm">
      <div>
        <p className="font-medium">{service.name}</p>
        <p className="text-muted">
          {cad(service.price)}
          {service.sec_price && Number(service.sec_price) > 0 ? ` / ${cad(service.sec_price)}` : ""} · {service.duration_minutes} min
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input value={price} onChange={(e) => setPrice(e.target.value)} className="w-24 rounded-lg border border-line px-2 py-1.5" aria-label={`Price for ${service.name}`} />
        <button type="button" className="text-sm font-semibold underline decoration-gold underline-offset-4" onClick={() => void onSavePrice(service, price)}>Save</button>
        <button type="button" className="text-sm text-error" onClick={() => void onDelete(service.id)}>Delete</button>
      </div>
    </li>
  );
}
