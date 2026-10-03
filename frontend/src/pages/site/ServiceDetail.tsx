import { Link, useParams } from "react-router-dom";
import { ChevronRight, Clock } from "lucide-react";
import { useCatalog } from "../../lib/catalog";
import { duration } from "../../lib/format";
import { money as cad } from "../../lib/timezone";
import { ButtonLink } from "../../ui/Button";
import { Container, EmptyState } from "../../ui/bits";
import Photo from "../../ui/Photo";

export default function ServiceDetail() {
  const { id } = useParams();
  const { services, categories, loading, error } = useCatalog();
  const service = services.find((item) => item.id === id);

  if (loading) {
    return (
      <Container className="py-24">
        <p className="text-sm text-muted">Loading service…</p>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-24">
        <EmptyState title="We couldn't load services." body={error} action="Try again" to="/services" />
      </Container>
    );
  }

  if (!service) {
    return (
      <Container className="py-24">
        <EmptyState title="We couldn't find that style." body="It may have been renamed or retired. Browse the current menu instead." action="View services" to="/services" />
      </Container>
    );
  }

  const related = services.filter((item) => item.categoryId === service.categoryId && item.id !== service.id).slice(0, 4);

  return (
    <>
      <Container className="pt-6 md:pt-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted">
          <Link to="/services" className="hover:text-ink">
            Services
          </Link>
          <ChevronRight className="size-3" aria-hidden />
          <Link to={`/services?category=${service.categoryId}`} className="hover:text-ink">
            {service.categoryName}
          </Link>
          <ChevronRight className="size-3" aria-hidden />
          <span className="text-ink" aria-current="page">
            {service.name}
          </span>
        </nav>
      </Container>

      <Container className="grid gap-10 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:py-12">
        <Photo art="braids" tone="sand" src={service.photo_url || undefined} alt={`${service.name} hairstyle`} className="aspect-[4/5] rounded-[var(--radius-card)] sm:aspect-square" />
        <div>
          <p className="eyebrow mb-3">{service.categoryName}</p>
          <h1 className="text-5xl leading-[1.05] md:text-6xl">{service.name}</h1>
          {service.description ? <p className="mt-4 max-w-md leading-relaxed text-muted">{service.description}</p> : null}
          <dl className="mt-8 grid grid-cols-2 gap-6 text-sm">
            <div>
              <dt className="text-muted">Price</dt>
              <dd className="mt-1 font-display text-4xl">{cad(service.price)}</dd>
            </div>
            <div>
              <dt className="text-muted">Duration</dt>
              <dd className="mt-1 inline-flex items-center gap-1.5 font-semibold">
                <Clock className="size-4 text-gold-deep" aria-hidden />
                {duration(service.duration_minutes, true)}
                <span className="font-normal text-muted">({service.duration_minutes} min)</span>
              </dd>
            </div>
          </dl>
          <ButtonLink to={`/book?service=${service.id}`} size="lg" className="mt-8" arrow>
            Request this style
          </ButtonLink>
          <p className="mt-3 text-xs text-muted">Sending a request doesn't confirm the appointment.</p>
        </div>
      </Container>

      {related.length ? (
        <Container className="pb-20">
          <h2 className="text-4xl">More in {categories?.find((item) => item.id === service.categoryId)?.name}</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <Link key={item.id} to={`/services/${item.id}`} className="group">
                <Photo art="braids" tone="sand" src={item.photo_url || undefined} alt="" className="aspect-[4/5] rounded-[var(--radius-card)]" zoom />
                <h3 className="mt-3 text-2xl group-hover:text-gold-deep">{item.name}</h3>
                <p className="text-sm text-muted">
                  {item.duration_minutes} min · {cad(item.price)}
                </p>
              </Link>
            ))}
          </div>
        </Container>
      ) : null}
    </>
  );
}
