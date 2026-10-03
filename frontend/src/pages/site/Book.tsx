import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { formatInTimeZone } from "date-fns-tz";
import { AlertCircle, ArrowLeft, Check, Clock, Lock, ShieldCheck } from "lucide-react";
import { ApiRequestError } from "../../api/client";
import { createBooking, createSetupIntent, getSlots } from "../../api/endpoints";
import type { PaymentMethod, Slot } from "../../api/types";
import CaptchaWidget from "../../components/CaptchaWidget";
import StripeCardForm from "../../components/StripeCardForm";
import { useCatalog, type CatalogService } from "../../lib/catalog";
import { errorMessage } from "../../lib/errors";
import { cn, duration } from "../../lib/format";
import { DISPLAY_TIMEZONE, formatDate, localDateKey, money as cad } from "../../lib/timezone";
import { Button } from "../../ui/Button";
import { Container } from "../../ui/bits";
import { Checkbox, Input } from "../../ui/form";
import Photo from "../../ui/Photo";

const STEPS = ["Service", "Date & Time", "Details", "Payment"] as const;
const DRAFT_KEY = "hairbychi:booking-draft";
const RESULT_KEY = "hairbychi:last-booking-response";
const WINDOW_DAYS = 21;

interface Draft {
  serviceIds: string[];
  slot: Slot | null;
  name: string;
  email: string;
  phone: string;
  agree: boolean;
  paymentMethod: PaymentMethod;
}

const EMPTY: Draft = {
  serviceIds: [],
  slot: null,
  name: "",
  email: "",
  phone: "",
  agree: false,
  paymentMethod: "offline",
};

function reginaToday() {
  return formatInTimeZone(new Date(), DISPLAY_TIMEZONE, "yyyy-MM-dd");
}

function addCalendarDays(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function slotRange(slot: Slot) {
  const start = formatInTimeZone(new Date(slot.start), DISPLAY_TIMEZONE, "h:mm a");
  const end = formatInTimeZone(new Date(slot.service_end_time), DISPLAY_TIMEZONE, "h:mm a");
  return `${start} – ${end} CST`;
}

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return EMPTY;
}

function Progress({ step, go }: { step: number; go: (i: number) => void }) {
  return (
    <nav aria-label="Booking progress" className="mb-10">
      <div className="relative h-0.5 rounded bg-sand-deep/60">
        <div className="absolute inset-y-0 left-0 rounded bg-gold transition-all duration-700 ease-out" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
      </div>
      <ol className="mt-4 grid grid-cols-4 gap-1">
        {STEPS.map((label, i) => (
          <li key={label} className="text-center first:text-left last:text-right">
            <button
              type="button"
              disabled={i >= step}
              onClick={() => go(i)}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-wide uppercase sm:text-xs",
                i === step ? "text-ink" : i < step ? "text-gold-deep hover:underline" : "text-muted/60",
              )}
            >
              <span
                className={cn(
                  "hidden size-5 place-items-center rounded-full text-[0.65rem] sm:grid",
                  i < step ? "bg-gold text-ivory" : i === step ? "bg-ink text-ivory" : "bg-sand text-muted",
                )}
                aria-hidden
              >
                {i < step ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn(i !== step && "max-sm:sr-only")}>{label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StepTitle({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub?: string }) {
  return (
    <div className="mb-8">
      <p className="eyebrow mb-3">{eyebrow}</p>
      <h1 className="text-4xl leading-[1.05] md:text-5xl">{title}</h1>
      {sub ? <p className="mt-3 max-w-xl text-muted">{sub}</p> : null}
    </div>
  );
}

export default function Book() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const top = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);
  const { categories, services, error: catalogError, loading: catalogLoading } = useCatalog();

  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [step, setStep] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [draft]);

  useEffect(() => {
    if (seeded.current || !services.length) return;
    const id = params.get("service");
    if (id && services.some((service) => service.id === id)) {
      setDraft((d) => ({ ...d, serviceIds: d.serviceIds.includes(id) ? d.serviceIds : [id] }));
      const match = services.find((service) => service.id === id);
      if (match) setCategoryId(match.categoryId);
    }
    seeded.current = true;
  }, [services, params]);

  const selected = useMemo(
    () => services.filter((service) => draft.serviceIds.includes(service.id)),
    [services, draft.serviceIds],
  );
  const totalPrice = selected.reduce((sum, service) => sum + Number(service.price), 0);
  const totalMinutes = selected.reduce((sum, service) => sum + service.duration_minutes, 0);
  const activeCategory = categoryId ?? categories?.[0]?.id ?? null;
  const visible = services.filter((service) => service.categoryId === activeCategory);

  const grouped = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots ?? []) {
      const key = localDateKey(slot.start);
      const list = map.get(key) ?? [];
      list.push(slot);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [slots]);

  useEffect(() => {
    if (step !== 1 || totalMinutes < 1) return;
    let active = true;
    setSlots(null);
    setSlotsError(null);
    const from = reginaToday();
    const to = addCalendarDays(from, WINDOW_DAYS);
    getSlots(from, to, totalMinutes)
      .then((response) => {
        if (active) setSlots(response.slots);
      })
      .catch((err) => {
        if (!active) return;
        setSlotsError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't load available times.");
      });
    return () => {
      active = false;
    };
  }, [step, totalMinutes]);

  useEffect(() => {
    if (draft.paymentMethod !== "online" || step !== 3) return;
    let active = true;
    setClientSecret(null);
    setSetupIntentId(null);
    setCardError(null);
    createSetupIntent({ name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim() })
      .then((response) => {
        if (active) setClientSecret(response.client_secret);
      })
      .catch((err) => {
        if (!active) return;
        setCardError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't start card verification. Please try again.");
      });
    return () => {
      active = false;
    };
  }, [draft.paymentMethod, draft.name, draft.email, draft.phone, step]);

  const go = (i: number) => {
    setStep(i);
    setFailure(null);
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const toggleService = (service: CatalogService) => {
    const on = draft.serviceIds.includes(service.id);
    update({
      serviceIds: on ? draft.serviceIds.filter((id) => id !== service.id) : [...draft.serviceIds, service.id],
      slot: null,
    });
  };

  const validateDetails = () => {
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = "Please add your name.";
    if (!/^\S+@\S+\.\S+$/.test(draft.email)) next.email = "Please enter a valid email so we can write to you.";
    if (draft.phone.replace(/\D/g, "").length < 10) next.phone = "Please enter a phone number with area code.";
    if (!draft.agree) next.agree = "Please agree to the terms and cancellation policy.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const canContinue = [
    selected.length > 0,
    !!draft.slot,
    true,
    draft.agree && !!captchaToken && (draft.paymentMethod === "offline" || !!setupIntentId),
  ][step];

  const next = () => {
    if (step === 2 && !validateDetails()) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    if (step < 3) go(step + 1);
    else void submit();
  };

  const submit = async () => {
    if (!draft.slot || !draft.agree || !captchaToken) return;
    if (draft.paymentMethod === "online" && !setupIntentId) return;
    setProcessing(true);
    setFailure(null);
    try {
      const response = await createBooking({
        client: {
          name: draft.name.trim(),
          email: draft.email.trim().toLowerCase(),
          phone: draft.phone.trim(),
        },
        service_ids: draft.serviceIds,
        requested_start_time: draft.slot.start,
        payment_method: draft.paymentMethod,
        policy_acknowledged: true,
        captcha_token: captchaToken,
        ...(draft.paymentMethod === "online" && setupIntentId ? { stripe_setup_intent_id: setupIntentId } : {}),
      });
      sessionStorage.setItem(RESULT_KEY, JSON.stringify(response));
      sessionStorage.removeItem(DRAFT_KEY);
      nav("/book/sent", { state: response });
    } catch (err) {
      setFailure(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "We couldn't send your request. Nothing was charged. Please try again.");
      setCaptchaToken("");
      setCaptchaNonce((n) => n + 1);
      setProcessing(false);
    }
  };

  const preferredDate = params.get("date");

  return (
    <div ref={top} className="scroll-mt-24 bg-ivory pb-40 md:pb-24">
      <Container className="pt-8 md:pt-12">
        <div className="mb-6 flex items-center justify-between">
          {step > 0 ? (
            <button type="button" onClick={() => go(step - 1)} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden /> Back
            </button>
          ) : (
            <Link to="/services" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden /> Services
            </Link>
          )}
          <p className="text-xs text-muted">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>
        <Progress step={step} go={go} />

        <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-14">
          <div key={step} className="min-w-0 animate-fade-up">
            {step === 0 ? (
              <>
                <StepTitle eyebrow="Step 1" title={<>What are we <em className="text-gold-deep">creating?</em></>} sub="Choose one or more services. The time you pick has to fit their combined length." />
                {catalogError ? (
                  <p className="rounded-2xl bg-error-soft p-4 text-sm text-error" role="alert">
                    {catalogError}
                  </p>
                ) : null}
                {catalogLoading ? <p className="text-sm text-muted">Loading services…</p> : null}
                {categories && categories.length === 0 ? <p className="text-sm text-muted">No services are published yet.</p> : null}
                {categories && categories.length > 0 ? (
                  <div className="no-scrollbar -mx-5 mb-8 flex gap-2 overflow-x-auto px-5" role="tablist" aria-label="Service category">
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        role="tab"
                        aria-selected={activeCategory === category.id}
                        onClick={() => setCategoryId(category.id)}
                        className={cn(
                          "shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition",
                          activeCategory === category.id ? "bg-ink text-ivory" : "bg-white/70 ring-1 ring-line hover:ring-ink/50",
                        )}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2" role="tabpanel">
                  {visible.map((service) => (
                    <ServiceOption key={service.id} service={service} selected={draft.serviceIds.includes(service.id)} onSelect={() => toggleService(service)} />
                  ))}
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <StepTitle
                  eyebrow="Step 2"
                  title={<>Pick your <em className="text-gold-deep">moment</em></>}
                  sub={`Times over the next ${WINDOW_DAYS} days that fit your ${duration(totalMinutes, true)} appointment. Shown in Regina time.`}
                />
                {slotsError ? (
                  <p className="rounded-2xl bg-error-soft p-4 text-sm text-error" role="alert">
                    {slotsError}
                  </p>
                ) : null}
                {!slots && !slotsError ? <p className="text-sm text-muted">Finding available times…</p> : null}
                {slots && slots.length === 0 ? <p className="text-sm text-muted">No times are open in this window. Please check back soon.</p> : null}
                <div className="space-y-8">
                  {grouped.map(([dateKey, daySlots]) => (
                    <section key={dateKey} id={`day-${dateKey}`} className={preferredDate === dateKey ? "rounded-2xl bg-gold-soft/40 p-4" : undefined}>
                      <h2 className="text-3xl">{formatDate(daySlots[0].start)}</h2>
                      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                        {daySlots.map((slot) => {
                          const on = draft.slot?.start === slot.start;
                          return (
                            <button
                              key={slot.start}
                              type="button"
                              aria-pressed={on}
                              onClick={() => update({ slot })}
                              className={cn(
                                "min-h-12 rounded-xl px-4 py-3 text-left text-sm font-semibold ring-1 transition",
                                on ? "bg-ink text-ivory ring-ink" : "bg-white ring-line hover:ring-ink",
                              )}
                            >
                              {slotRange(slot)}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <StepTitle eyebrow="Step 3" title={<>A little about <em className="text-gold-deep">you</em></>} sub="We'll email you once your request has been reviewed." />
                <div className="grid gap-5 sm:grid-cols-2">
                  <Input label="Full name" autoComplete="name" value={draft.name} onChange={(e) => update({ name: e.target.value })} error={errors.name} className="sm:col-span-2" />
                  <Input label="Email" type="email" autoComplete="email" value={draft.email} onChange={(e) => update({ email: e.target.value })} error={errors.email} hint="Your review email goes here." />
                  <Input label="Phone number" type="tel" autoComplete="tel" value={draft.phone} onChange={(e) => update({ phone: e.target.value })} error={errors.phone} />
                </div>
                <Checkbox className="mt-8" checked={draft.agree} onChange={(agree) => update({ agree })}>
                  I have read and agree to the{" "}
                  <Link to="/policies#terms" target="_blank" className="font-semibold underline decoration-gold underline-offset-4">
                    terms
                  </Link>{" "}
                  and{" "}
                  <Link to="/policies#cancellation" target="_blank" className="font-semibold underline decoration-gold underline-offset-4">
                    cancellation policy
                  </Link>
                  .
                </Checkbox>
                {errors.agree ? (
                  <p className="mt-2 text-sm text-error" role="alert">
                    {errors.agree}
                  </p>
                ) : null}
              </>
            ) : null}

            {step === 3 && draft.slot ? (
              <>
                <StepTitle eyebrow="Step 4" title={<>Review & <em className="text-gold-deep">send</em></>} sub="This sends a request. Nothing is confirmed until it's reviewed." />
                {failure ? (
                  <div role="alert" className="mb-8 flex gap-2 rounded-2xl bg-error-soft p-5 text-sm text-error">
                    <AlertCircle className="size-5 shrink-0" aria-hidden />
                    <p className="font-semibold">{failure}</p>
                  </div>
                ) : null}

                <section className="rounded-[var(--radius-card)] border border-line bg-white/70 p-6">
                  <h2 className="text-3xl">Your request</h2>
                  <ul className="mt-5 space-y-3 text-sm">
                    {selected.map((service) => (
                      <li key={service.id} className="flex justify-between gap-4">
                        <span>{service.name}</span>
                        <span className="shrink-0 font-medium">{cad(service.price)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                    <div className="flex justify-between font-semibold">
                      <dt>Combined total</dt>
                      <dd>{cad(totalPrice)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Length</dt>
                      <dd>{duration(totalMinutes, true)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">When</dt>
                      <dd className="text-right">
                        {formatDate(draft.slot.start)}
                        <span className="block">{slotRange(draft.slot)}</span>
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="mt-8" aria-labelledby="pay-h">
                  <h2 id="pay-h" className="text-3xl">
                    Payment
                  </h2>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["offline", "Pay offline", "Cash or e-transfer. No card is taken now."],
                        ["online", "Pay online", "Save a card. Nothing is charged when you submit."],
                      ] as const
                    ).map(([value, label, hint]) => (
                      <label key={value} className={cn("cursor-pointer rounded-2xl bg-white p-4 ring-1 transition", draft.paymentMethod === value ? "ring-2 ring-ink" : "ring-line")}>
                        <input type="radio" name="pay" className="sr-only" checked={draft.paymentMethod === value} onChange={() => update({ paymentMethod: value })} />
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="text-xs text-muted">{hint}</span>
                      </label>
                    ))}
                  </div>

                  {draft.paymentMethod === "online" ? (
                    <div className="mt-5 rounded-2xl border border-line bg-white p-5">
                      <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                        <Lock className="size-3.5" aria-hidden /> Card verification
                      </p>
                      <p className="mb-4 text-sm text-muted">Your card is saved for later. Submitting this request does not charge it.</p>
                      {cardError ? <p className="mb-3 text-sm text-error">{cardError}</p> : null}
                      {clientSecret ? (
                        <StripeCardForm clientSecret={clientSecret} onReady={setSetupIntentId} />
                      ) : cardError ? null : (
                        <p className="text-sm text-muted">Starting card verification…</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-5 flex gap-2.5 rounded-2xl bg-gold-soft/50 p-4 text-sm leading-relaxed">
                      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold-deep" aria-hidden />
                      <span>No card is taken now. Your request stays pending until it's reviewed.</span>
                    </p>
                  )}

                  <div className="mt-6">
                    <p className="mb-2 text-sm font-semibold">Quick human check</p>
                    <CaptchaWidget key={captchaNonce} onVerify={setCaptchaToken} />
                  </div>
                </section>
              </>
            ) : null}
          </div>

          <aside className="hidden lg:block" aria-label="Booking summary">
            <Summary selected={selected} totalPrice={totalPrice} totalMinutes={totalMinutes} slot={draft.slot} step={step} canContinue={canContinue} processing={processing} onNext={next} />
          </aside>
        </div>
      </Container>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted">{selected.length ? selected.map((service) => service.name).join(", ") : "Choose a service"}</p>
            <p className="font-display text-2xl leading-none">{selected.length ? cad(totalPrice) : "—"}</p>
          </div>
          <Button size="lg" disabled={!canContinue || processing} loading={processing} onClick={next}>
            {step === 3 ? "Submit request" : "Continue"}
          </Button>
        </div>
      </div>

      {processing ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ivory/85 backdrop-blur-sm" role="status" aria-live="assertive">
          <div className="text-center">
            <div className="mx-auto size-14 animate-spin rounded-full border-2 border-sand-deep border-t-gold" aria-hidden />
            <p className="mt-6 font-display text-3xl">Sending your request…</p>
            <p className="mt-1 text-sm text-muted">Please don't close this page.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Summary({
  selected,
  totalPrice,
  totalMinutes,
  slot,
  step,
  canContinue,
  processing,
  onNext,
}: {
  selected: CatalogService[];
  totalPrice: number;
  totalMinutes: number;
  slot: Slot | null;
  step: number;
  canContinue: boolean;
  processing: boolean;
  onNext: () => void;
}) {
  return (
    <div className="sticky top-28 rounded-[var(--radius-card)] bg-white/80 p-6 ring-1 ring-line">
      {selected.length ? (
        <>
          <ul className="space-y-2 text-sm">
            {selected.map((service) => (
              <li key={service.id} className="flex justify-between gap-3">
                <span className="font-display text-2xl leading-tight">{service.name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
            <Clock className="size-3.5" aria-hidden /> {duration(totalMinutes)}
          </p>
          <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Combined</dt>
              <dd className="font-medium">{cad(totalPrice)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">When</dt>
              <dd className="text-right font-medium">{slot ? `${formatDate(slot.start)}, ${slotRange(slot)}` : "Not chosen yet"}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="text-sm text-muted">Your selections will appear here as you go.</p>
      )}
      <Button className="mt-6 w-full" size="lg" disabled={!canContinue || processing} loading={processing} onClick={onNext} arrow={step < 3}>
        {step === 3 ? "Submit request" : "Continue"}
      </Button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
        <Lock className="size-3" aria-hidden /> Request only · Nothing is charged now
      </p>
    </div>
  );
}

function ServiceOption({ service, selected, onSelect }: { service: CatalogService; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn("group flex gap-4 rounded-[var(--radius-card)] bg-white/70 p-3 text-left ring-1 transition", selected ? "ring-2 ring-ink" : "ring-line hover:ring-ink/40")}
    >
      <Photo art="braids" tone="sand" src={service.photo_url || undefined} alt="" className="aspect-[4/5] w-24 shrink-0 rounded-2xl sm:w-28" zoom />
      <span className="flex min-w-0 flex-1 flex-col py-1 pr-1">
        <span className="font-display text-2xl leading-tight">{service.name}</span>
        <span className="mt-1 text-sm font-semibold">
          {cad(service.price)} <span className="font-normal text-muted">· {service.duration_minutes} min</span>
        </span>
        {service.description ? <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{service.description}</span> : null}
        <span className={cn("mt-auto inline-flex min-h-9 w-fit items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition", selected ? "bg-ink text-ivory" : "border border-ink/50")}>
          {selected ? (
            <>
              <Check className="size-3.5" aria-hidden /> Selected
            </>
          ) : (
            "Select"
          )}
        </span>
      </span>
    </button>
  );
}
