import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiRequestError } from "../../api/client";
import { adminClearHighRisk, adminGetClient } from "../../api/endpoints";
import type { Client } from "../../api/types";
import { errorMessage } from "../../lib/errors";
import { cn } from "../../lib/format";
import { formatDateTime } from "../../lib/timezone";
import { Button } from "../../ui/Button";
import { Panel, StudioTitle, inputCls } from "./StudioLayout";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!id) return;
    adminGetClient(id)
      .then(setClient)
      .catch((err) => setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't load this client."));
  };

  useEffect(load, [id]);

  const clear = async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      setClient(await adminClearHighRisk(id, note.trim() || undefined));
      setNote("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't clear the high-risk flag.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !client) return <p className="rounded-2xl bg-error-soft p-4 text-sm text-error">{error}</p>;
  if (!client) return <p className="text-sm text-muted">Loading client…</p>;

  return (
    <div>
      <Link to="/studio" className="text-sm font-semibold text-ink-soft underline decoration-gold underline-offset-4">Back to calendar</Link>
      <StudioTitle title={client.name} sub={[client.email, client.phone].filter(Boolean).join(" · ")} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Strikes" value={client.strike_count} />
        <Stat label="Reschedules" value={client.reschedule_count ?? 0} />
        <Stat label="High risk" value={client.high_risk_flag ? "Yes" : "No"} />
      </div>

      {client.high_risk_flag ? (
        <Panel title="Clear high risk" className="mb-4">
          <p className="mb-3 text-sm text-muted">Strikes stay on the record. Clearing the flag lets the next booking use the usual deposit.</p>
          {error ? <p className="mb-3 text-sm text-error">{error}</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-xs font-semibold text-ink-soft">
              Note
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className={cn(inputCls, "mt-1.5 font-normal")} />
            </label>
            <Button type="button" disabled={busy} loading={busy} onClick={() => void clear()}>Clear flag</Button>
          </div>
          {client.high_risk_cleared_note ? <p className="mt-3 text-sm text-muted">Last note: {client.high_risk_cleared_note}</p> : null}
        </Panel>
      ) : null}

      <Panel title="Strikes" className="mb-4">
        {client.strikes?.length ? (
          <ul className="space-y-2 text-sm">
            {client.strikes.map((strike) => (
              <li key={strike.booking_id}>
                <Link to={`/studio/bookings/${strike.booking_id}`} className="font-semibold underline decoration-gold underline-offset-4">
                  {formatDateTime(strike.requested_start_time)}
                </Link>
                {strike.note ? <span className="block text-muted">{strike.note}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No no-show strikes.</p>
        )}
      </Panel>

      <Panel title="Bookings">
        {client.bookings?.length ? (
          <ul className="space-y-2 text-sm">
            {client.bookings.map((booking) => (
              <li key={booking.id} className="flex flex-wrap justify-between gap-2">
                <Link to={`/studio/bookings/${booking.id}`} className="font-medium underline decoration-gold underline-offset-4">
                  {formatDateTime(booking.requested_start_time)}
                </Link>
                <span className="text-muted">{booking.status.replaceAll("_", " ")}{booking.arrived_status ? ` · ${booking.arrived_status.replace("_", " ")}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No booking history yet.</p>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-line/70">
      <p className="text-xs font-semibold tracking-wider text-muted uppercase">{label}</p>
      <p className="mt-2 font-display text-4xl leading-none">{value}</p>
    </div>
  );
}
