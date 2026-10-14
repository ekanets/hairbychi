import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiRequestError } from "../../api/client";
import { adminApproveBooking, adminDeclineBooking, adminManualOverride, adminMarkArrival } from "../../api/endpoints";
import type { AdminBookingListItem } from "../../api/types";
import { errorMessage } from "../../lib/errors";
import { cn } from "../../lib/format";
import { fetchAllPages } from "../../lib/pagination";
import { formatDateTime, money as cad } from "../../lib/timezone";
import { Button } from "../../ui/Button";
import { Panel, StudioTitle, inputCls } from "./StudioLayout";

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = useState<AdminBookingListItem | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setMissing(false);
    fetchAllPages<AdminBookingListItem>("/admin/bookings", { include_archived: true, page_size: 100 })
      .then((rows) => {
        if (!active) return;
        const match = rows.find((row) => row.id === id) ?? null;
        setBooking(match);
        setMissing(!match);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't load this booking.");
      });
    return () => {
      active = false;
    };
  }, [id, reload]);

  if (error) return <p className="rounded-2xl bg-error-soft p-4 text-sm text-error">{error}</p>;
  if (missing) return <p className="text-sm text-muted">That booking isn't on the dashboard.</p>;
  if (!booking) return <p className="text-sm text-muted">Loading booking…</p>;

  return (
    <div>
      <Link to="/studio" className="text-sm font-semibold text-ink-soft underline decoration-gold underline-offset-4">
        Back to calendar
      </Link>
      <StudioTitle
        title={booking.client.name}
        sub={`${formatDateTime(booking.requested_start_time)} – ${formatDateTime(booking.service_end_time)}`}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold tracking-wide text-ivory uppercase">{booking.status.replaceAll("_", " ")}</span>
        {booking.conflict_flag ? <span className="rounded-full bg-error-soft px-3 py-1 text-xs font-semibold text-error uppercase">Overlaps another request</span> : null}
        {booking.full_payment_required ? <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold-deep uppercase">Full payment</span> : null}
      </div>

      <Panel>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Client</dt>
            <dd>
              <Link to={`/studio/clients/${booking.client.id}`} className="font-semibold underline decoration-gold underline-offset-4">
                {booking.client.name}
              </Link>
              <span className="block text-muted">{booking.client.email} · {booking.client.phone}</span>
              {booking.client.high_risk_flag ? <span className="text-error">High risk · {booking.client.strike_count} strikes</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Payment</dt>
            <dd className="font-medium">
              {booking.payment_method}
              {booking.deposit_amount ? <span className="block font-normal text-muted">Deposit {cad(booking.deposit_amount)}</span> : null}
              {booking.deposit_captured ? <span className="block font-normal text-muted">Deposit captured</span> : null}
              {booking.refund_owed ? <span className="block font-normal text-error">Refund owed</span> : null}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Services</dt>
            <dd>
              {booking.items.map((item) => (
                <span key={item.id} className="block">
                  {item.service_name} · {cad(item.price_at_booking)} · {item.duration_at_booking} min
                </span>
              ))}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted">The calendar holds this chair until {formatDateTime(booking.calendar_blocked_until)}, including the buffer after the service.</p>
      </Panel>

      <div className="mt-4 space-y-4">
        {booking.status === "pending" ? <Review booking={booking} onDone={() => setReload((n) => n + 1)} /> : null}
        {booking.status === "approved" || booking.status === "manually_approved" ? (
          <Arrival booking={booking} onDone={() => setReload((n) => n + 1)} />
        ) : null}
        {booking.status === "payment_failed" ? <Override bookingId={booking.id} onDone={() => setReload((n) => n + 1)} /> : null}
      </div>
    </div>
  );
}

function Review({ booking, onDone }: { booking: AdminBookingListItem; onDone: () => void }) {
  const [proofUrl, setProofUrl] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const offline = booking.payment_method === "offline";

  const approve = async () => {
    if (booking.conflict_flag && !window.confirm("This overlaps other pending requests. Approving it declines those others.")) return;
    setBusy(true);
    setError(null);
    try {
      await adminApproveBooking(booking.id, offline ? { proof_url: proofUrl.trim(), proof_note: proofNote.trim() } : {});
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't approve this request.");
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminDeclineBooking(booking.id, reason.trim() || undefined);
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't decline this request.");
      setBusy(false);
    }
  };

  return (
    <Panel title="Review this request">
      {offline ? (
        <div className="mb-4 grid gap-3">
          <label className="text-xs font-semibold text-ink-soft">
            Proof of payment URL
            <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://…" className={cn(inputCls, "mt-1.5 font-normal")} />
          </label>
          <label className="text-xs font-semibold text-ink-soft">
            Proof note
            <input value={proofNote} onChange={(e) => setProofNote(e.target.value)} placeholder="Optional" className={cn(inputCls, "mt-1.5 font-normal")} />
          </label>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted">Online card is already saved. Approving is when the charge happens.</p>
      )}
      {error ? <p className="mb-3 text-sm text-error">{error}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Button type="button" disabled={busy || (offline && !proofUrl.trim())} loading={busy} onClick={() => void approve()}>
          Approve
        </Button>
        <label className="min-w-0 flex-1 text-xs font-semibold text-ink-soft">
          Decline reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" className={cn(inputCls, "mt-1.5 font-normal")} />
        </label>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void decline()}>
          Decline
        </Button>
      </div>
    </Panel>
  );
}

function Arrival({ booking, onDone }: { booking: AdminBookingListItem; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = booking.arrived_status === "arrived" || booking.arrived_status === "no_show";

  const mark = async (status: "arrived" | "no_show") => {
    setBusy(true);
    setError(null);
    try {
      await adminMarkArrival(booking.id, status, note.trim());
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't update arrival.");
      setBusy(false);
    }
  };

  return (
    <Panel title="Arrival">
      {done ? <p className="text-sm">Marked {booking.arrived_status?.replace("_", " ")}.</p> : (
        <>
          {error ? <p className="mb-3 text-sm text-error">{error}</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Button type="button" disabled={busy} onClick={() => void mark("arrived")}>Mark arrived</Button>
            <label className="min-w-0 flex-1 text-xs font-semibold text-ink-soft">
              No-show note
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required for a no-show" className={cn(inputCls, "mt-1.5 font-normal")} />
            </label>
            <Button type="button" variant="secondary" disabled={busy || !note.trim()} onClick={() => void mark("no_show")}>
              Mark no-show
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}

function Override({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminManualOverride(bookingId, note.trim());
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't record the override.");
      setBusy(false);
    }
  };

  return (
    <Panel title="Payment failed">
      <p className="mb-3 text-sm text-muted">The card charge failed. If you collected payment another way, record it here. A note is required.</p>
      {error ? <p className="mb-3 text-sm text-error">{error}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-xs font-semibold text-ink-soft">
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} className={cn(inputCls, "mt-1.5 font-normal")} />
        </label>
        <Button type="button" disabled={busy || !note.trim()} onClick={() => void save()}>Manually approve</Button>
      </div>
    </Panel>
  );
}
