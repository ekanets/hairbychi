import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useCatalog } from "../../lib/catalog";
import { cn } from "../../lib/format";
import { money as cad } from "../../lib/timezone";
import { Container, EmptyState, PageHeader, Reveal } from "../../ui/bits";
import Photo from "../../ui/Photo";
import { FinalCta } from "./Home";

const PRICE = [
  { id: "any", label: "Any price", test: () => true },
  { id: "u100", label: "Under $100", test: (p: number) => p < 100 },
  { id: "100-200", label: "$100 to $200", test: (p: number) => p >= 100 && p <= 200 },
  { id: "200", label: "$200+", test: (p: number) => p > 200 },
];
const TIME = [
  { id: "any", label: "Any length", test: () => true },
  { id: "u2", label: "Under 2 hours", test: (m: number) => m < 120 },
  { id: "2-4", label: "2 to 4 hours", test: (m: number) => m >= 120 && m <= 240 },
  { id: "4", label: "4+ hours", test: (m: number) => m > 240 },
];

function categoryLabel(name: string) {
  return name.replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

function priceLine(service: { price: string; sec_price?: string }) {
  const extra = Number(service.sec_price);
  if (service.sec_price && extra > 0 && service.sec_price !== service.price) {
    return `${cad(service.price)} / ${cad(service.sec_price)}`;
  }
  return cad(service.price);
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition",
        on ? "border-ink bg-ink text-ivory" : "border-line bg-white/60 text-ink-soft hover:border-ink/50",
      )}
    >
      {children}
    </button>
  );
}

export default function Services() {
  const { categories, services, error, loading } = useCatalog();
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "all";
  const [q, setQ] = useState("");
  const [price, setPrice] = useState("any");
  const [time, setTime] = useState("any");
  const [showFilters, setShowFilters] = useState(false);

  const setCategory = (c: string) => {
    const next = new URLSearchParams(params);
    if (c === "all") next.delete("category");
    else next.set("category", c);
    setParams(next, { replace: true });
  };

  const list = useMemo(
    () =>
      services.filter((service) => {
        if (category !== "all" && service.categoryId !== category) return false;
        const haystack = `${service.name} ${service.description ?? ""}`.toLowerCase();
        if (q && !haystack.includes(q.toLowerCase())) return false;
        if (!PRICE.find((band) => band.id === price)!.test(Number(service.price))) return false;
        if (!TIME.find((band) => band.id === time)!.test(service.duration_minutes)) return false;
        return true;
      }),
    [services, category, q, price, time],
  );

  const activeCount = [price !== "any", time !== "any"].filter(Boolean).length;
  const clear = () => {
    setPrice("any");
    setTime("any");
    setQ("");
    setCategory("all");
  };
  const catName = categories?.find((item) => item.id === category)?.name;

  return (
    <>
      <PageHeader
        eyebrow="Services & pricing"
        title={
          <>
            {catName ? catName : "Every style,"} <em className="text-gold-deep">{catName ? "services" : "clearly priced."}</em>
          </>
        }
        sub="Transparent prices and honest timings. Choose a style to send a request."
      />

      <div className="sticky top-18 z-20 border-b border-line/70 bg-ivory/92 backdrop-blur-md md:top-20">
        <Container className="flex items-center gap-3 py-3">
          <div className="no-scrollbar -mx-1 flex flex-1 gap-2 overflow-x-auto px-1" role="group" aria-label="Category">
            <Chip on={category === "all"} onClick={() => setCategory("all")}>
              All
            </Chip>
            {(categories ?? []).map((item) => (
              <Chip key={item.id} on={category === item.id} onClick={() => setCategory(item.id)}>
                {categoryLabel(item.name)}
              </Chip>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="service-filters"
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-ink px-4 text-sm font-semibold"
          >
            <SlidersHorizontal className="size-4" aria-hidden /> Filters{activeCount ? ` (${activeCount})` : ""}
          </button>
        </Container>
        {showFilters ? (
          <Container className="pb-5">
            <div id="service-filters" className="grid animate-fade-up gap-5 rounded-2xl bg-white/70 p-5 ring-1 ring-line md:grid-cols-[1.4fr_1fr_1fr] md:items-end">
              <label className="flex flex-col gap-2 text-sm font-semibold">
                Search
                <span className="relative">
                  <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services" className="w-full rounded-xl border border-line bg-white py-2.5 pr-3 pl-10 font-normal focus:border-gold focus:outline-none" />
                </span>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                Price
                <select value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2.5 font-normal">
                  {PRICE.map((band) => (
                    <option key={band.id} value={band.id}>
                      {band.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                Duration
                <select value={time} onChange={(e) => setTime(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2.5 font-normal">
                  {TIME.map((band) => (
                    <option key={band.id} value={band.id}>
                      {band.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Container>
        ) : null}
      </div>

      <Container className="py-12 md:py-16">
        {error ? (
          <p className="rounded-2xl bg-error-soft p-4 text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? <p className="text-sm text-muted">Loading services…</p> : null}
        <div className="mb-8 flex items-center justify-between text-sm text-muted" aria-live="polite">
          <p>
            {list.length} {list.length === 1 ? "style" : "styles"}
          </p>
          {activeCount || q || category !== "all" ? (
            <button type="button" onClick={clear} className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-ink underline decoration-gold underline-offset-4">
              <X className="size-4" aria-hidden /> Clear all
            </button>
          ) : null}
        </div>
        {list.length ? (
          <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((service, i) => (
              <Reveal key={service.id} delay={(i % 4) * 60}>
                <Link to={`/services/${service.id}`} className="group block">
                  <Photo art="braids" tone="sand" src={service.photo_url || undefined} alt={`${service.name} hairstyle`} className="aspect-[4/5] rounded-[var(--radius-card)]" zoom />
                  <div className="mt-4">
                    <h3 className="text-[1.6rem] leading-tight transition group-hover:text-gold-deep">{service.name}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {service.duration_minutes} min · {priceLine(service)}
                    </p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        ) : !loading && !error ? (
          <EmptyState title="No services to show." body="The menu is empty right now, or nothing matches these filters." action="Clear filters" to="/services" />
        ) : null}
      </Container>
      <FinalCta />
    </>
  );
}
