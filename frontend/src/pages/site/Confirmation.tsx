import { useLocation } from "react-router-dom";
import { Check, Info } from "lucide-react";
import type { BookingCreateResponse } from "../../api/types";
import { formatDateTime, money as cad } from "../../lib/timezone";
import { ButtonLink } from "../../ui/Button";
import { Container, EmptyState } from "../../ui/bits";

const RESULT_KEY = "hairbychi:last-booking-response";

function readBooking(state: unknown): BookingCreateResponse | null {
  if (state && typeof state === "object" && "booking_id" in state && "amount_due_today" in state) {
    return state as BookingCreateResponse;
  }
  try {
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookingCreateResponse;
    if (parsed?.booking_id && parsed.amount_due_today && parsed.service_end_time) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export default function Confirmation() {
  const { state } = useLocation();
  const booking = readBooking(state);

  if (!booking) {
    return (
      <Container className="py-24">
        <EmptyState title="We couldn't find that request." body="If you just sent one, it may have opened in another tab. You can start a new request any time." action="Start a request" to="/book" />
      </Container>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-gold-soft/60 to-transparent" aria-hidden />
      <Container className="relative max-w-3xl py-16 text-center md:py-24">
        <div className="mx-auto grid size-20 animate-fade-up place-items-center rounded-full bg-ink text-gold shadow-xl">
          <Check className="size-9" strokeWidth={2.2} aria-hidden />
        </div>
        <h1 className="mt-8 animate-fade-up text-5xl leading-tight [animation-delay:100ms] md:text-6xl">Your request has been sent!</h1>
        <p className="mt-4 animate-fade-up text-lg text-muted [animation-delay:180ms]">You'll receive an email once it's reviewed.</p>
        <p className="mt-3 text-sm font-semibold tracking-wide text-gold-deep uppercase">Status: pending</p>

        {booking.strike_warning ? (
          <div className="mx-auto mt-8 flex max-w-xl gap-3 rounded-2xl bg-gold-soft/70 p-5 text-left text-sm leading-relaxed ring-1 ring-gold/30" role="status">
            <Info className="mt-0.5 size-5 shrink-0 text-gold-deep" aria-hidden />
            <p>Heads up — your next missed appointment or late cancellation will require full payment upfront for any future booking.</p>
          </div>
        ) : null}

        <div className="mt-10 animate-fade-up overflow-hidden rounded-[1.75rem] bg-white text-left shadow-[0_40px_80px_-40px_rgba(28,24,22,0.35)] ring-1 ring-line [animation-delay:260ms]">
          <dl className="grid gap-6 p-6 sm:grid-cols-2 md:p-8">
            <div>
              <dt className="text-sm text-muted">Service ends</dt>
              <dd className="mt-1 font-semibold">{formatDateTime(booking.service_end_time)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Amount due today</dt>
              <dd className="mt-1 font-semibold">{cad(booking.amount_due_today)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-8">
          <ButtonLink to="/services" variant="secondary" size="lg">
            Back to services
          </ButtonLink>
        </div>
      </Container>
    </div>
  );
}
