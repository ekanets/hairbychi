import { useEffect, useState } from "react";
import { ApiRequestError } from "../../api/client";
import { adminApproveBooking, adminDeclineBooking } from "../../api/endpoints";
import type { AdminBookingListItem } from "../../api/types";
import { errorMessage } from "../../lib/errors";
import { fetchAllPages } from "../../lib/pagination";
import { formatDateTime, money as cad } from "../../lib/timezone";
import { Button } from "../../ui/Button";
import { Panel, StudioTitle } from "./StudioLayout";

export default function PendingBookings() {
  const [bookings, setBookings] = useState<AdminBookingListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setBookings(null);
    fetchAllPages<AdminBookingListItem>("/admin/bookings", { status: "pending", include_archived: false })
      .then((rows) => {
        if (active) setBookings(rows);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't load requests.");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  return (
    <div>
      <StudioTitle title="Requests" sub="Pending requests waiting for a decision. Approving is what confirms them." />
      {error ? (
        <p className="mb-6 rounded-2xl bg-error-soft p-4 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
      {!bookings && !error ? <p className="text-sm text-muted">Loading requests…</p> : null}
      {bookings?.length === 0 ? <p className="text-sm text-muted">No pending requests.</p> : null}
      <div className="space-y-4">
        {bookings?.map((booking) => (
          <RequestCard key={booking.id} booking={booking} onDone={() => setReload((n) => n + 1)} />
        ))}
      </div>
    </div>
  );
}

function RequestCard({ booking, onDone }: { booking: AdminBookingListItem; onDone: () => void }) {
  const [proofUrl, setProofUrl] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offline = booking.payment_method === "offline";
  const canApprove = offline ? proofUrl.trim().length > 0 : true;
  const total = booking.items.reduce((sum, item) => sum + Number(item.price_at_booking), 0);

  const run = async (action: "approve" | "decline") => {
    setBusy(action);
    setError(null);
    try {
      if (action === "approve") {
        await adminApproveBooking(
          booking.id,
          offline ? { proof_url: proofUrl.trim(), proof_note: proofNote.trim() } : {},
        );
      } else {
        await adminDeclineBooking(booking.id, reason.trim() || undefined);
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Something went wrong.");
      setBusy(null);
    }
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">{booking.client.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {booking.client.email} · {booking.client.phone}
          </p>
        </div>
        <p className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold tracking-wide text-gold-deep uppercase">Pending</p>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Starts</dt>
          <dd className="font-medium">{formatDateTime(booking.requested_start_time)}</dd>
        </div>
        <div>
          <dt className="text-muted">Service ends</dt>
          <dd className="font-medium">{formatDateTime(booking.service_end_time)}</dd>
        </div>
        <div>
          <dt className="text-muted">Services</dt>
          <dd>
            {booking.items.map((item) => (
              <span key={item.id} className="block">
                {item.service_name} · {cad(item.price_at_booking)} · {item.duration_at_booking} min
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Payment</dt>
          <dd className="font-medium">
            {booking.payment_method} · {cad(total)}
            {booking.deposit_amount ? <span className="block font-normal text-muted">Deposit {cad(booking.deposit_amount)}</span> : null}
          </dd>
        </div>
      </dl>
      {booking.conflict_flag ? <p className="mt-3 text-sm text-error">This request overlaps another pending request.</p> : null}
      {offline ? (
        <div className="mt-4 grid gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-soft">
            Proof of payment URL
            <input
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              placeholder="https://…"
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal focus:border-gold focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-soft">
            Proof note
            <input
              value={proofNote}
              onChange={(e) => setProofNote(e.target.value)}
              placeholder="Optional note"
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal focus:border-gold focus:outline-none"
            />
          </label>
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Button type="button" disabled={!canApprove || busy !== null} loading={busy === "approve"} onClick={() => void run("approve")}>
          Approve
        </Button>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-semibold text-ink-soft">
          Decline reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional"
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal focus:border-gold focus:outline-none"
          />
        </label>
        <Button type="button" variant="secondary" disabled={busy !== null} loading={busy === "decline"} onClick={() => void run("decline")}>
          Decline
        </Button>
      </div>
    </Panel>
  );
}
